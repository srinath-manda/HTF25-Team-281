import { Injectable, signal, WritableSignal } from '@angular/core';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { RequestLog, ThreatStats, ThreatLevel, ActionTaken, ViewType, ThreatAnalysisResult, IPReputationResult, AdaptiveRule, TargetLoginStatus, PayloadGeneratorResult, SecurityLevel, HoneypotStats, ProductDetails } from '../types';

@Injectable({
  providedIn: 'root',
})
export class WafService {
  private ai: GoogleGenAI;
  
  // App state signals
  readonly activeView: WritableSignal<ViewType> = signal('dashboard');
  readonly requestLogs: WritableSignal<RequestLog[]> = signal([]);
  readonly stats: WritableSignal<ThreatStats> = signal({
    totalRequests: 0,
    threatsDetected: 0,
    threatsBlocked: 0,
    uptime: '0d 0h 0m',
    adaptiveRules: 0,
  });
  readonly adaptiveRules: WritableSignal<AdaptiveRule[]> = signal([]);
  readonly honeypotStats: WritableSignal<HoneypotStats> = signal({
    status: 'Initializing',
    luredAttackers: 0,
  });
  
  // Shared state for payload generator -> attacker tools
  readonly payloadForAttacker = signal<string>('');

  // Firewall and Target Page state
  readonly firewallEnabled = signal(true);
  readonly securityLevel = signal<SecurityLevel>('Low');
  readonly targetPageComments = signal<string[]>([
      'This is a fantastic product! Highly recommended.',
      'Great value for the price. Works as expected.',
      'Could be better, but it does the job.'
  ]);
  readonly targetPageLoginStatus = signal<TargetLoginStatus>('Logged Out');
  readonly targetProductDetails = signal<ProductDetails>({
    name: 'Quantum Entangler X1',
    description: 'The latest in personal quantum computing. Secure, fast, and guaranteed to collapse wave functions on demand. Perfect for everyday superpositioning.',
    price: 1337.00
  });

  // Gemini API for payload analysis
  readonly analysisResult: WritableSignal<ThreatAnalysisResult | null> = signal(null);
  readonly isLoadingAnalysis: WritableSignal<boolean> = signal(false);
  readonly analysisError: WritableSignal<string | null> = signal(null);

  // Gemini API for payload generation
  readonly aiGeneratedPayload: WritableSignal<PayloadGeneratorResult | null> = signal(null);
  readonly isLoadingAiPayload: WritableSignal<boolean> = signal(false);
  readonly aiPayloadError: WritableSignal<string | null> = signal(null);
  
  // Attacker Profile
  private readonly ATTACKER_SOURCE = { ip: "142.250.191.78", country: "USA", city: "Mountain View", asn: "AS15169 Google LLC", lat: 37.422, lon: -122.084, userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36" };

  // Rate Limiting
  private failedLoginAttempts = new Map<string, { count: number, timestamp: number }>();
  private readonly RATE_LIMIT_THRESHOLD = 5;
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

  private startTime = Date.now();
  
  constructor() {
    try {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    } catch (e) {
      console.error("Failed to initialize GoogleGenAI. API_KEY might be missing.", e);
      const errorMsg = "AI service is not configured. Please check API key.";
      this.analysisError.set(errorMsg);
      this.aiPayloadError.set(errorMsg);
    }
    this.updateUptime();
    this.initializeHoneypot();
  }

  setActiveView(view: ViewType) {
    this.activeView.set(view);
  }

  toggleFirewall() {
    this.firewallEnabled.update(v => !v);
  }

  setSecurityLevel(level: SecurityLevel) {
    this.securityLevel.set(level);
  }

  processRequest(req: Partial<RequestLog>): { success: boolean; message: string, log: RequestLog } {
    let threat: { type: string, level: ThreatLevel } | null = null;
    const attackerIp = this.ATTACKER_SOURCE.ip;
    const securityLevel = this.securityLevel();
    
    // --- Rate Limiting for Brute-Force ---
    if (req.path === '/login') {
        const now = Date.now();
        const attempts = this.failedLoginAttempts.get(attackerIp);
        if (attempts && (now - attempts.timestamp < this.RATE_LIMIT_WINDOW) && attempts.count >= this.RATE_LIMIT_THRESHOLD) {
            const log = this.createLogEntry('High', 'Blocked', 'Rate Limited', req.payload);
            this.requestLogs.update(logs => [log, ...logs.slice(0, 199)]);
            this.stats.update(s => ({ ...s, totalRequests: s.totalRequests + 1, threatsDetected: s.threatsDetected + 1, threatsBlocked: s.threatsBlocked + 1 }));
            if (this.firewallEnabled()) {
               this.generateAndDeployAdaptiveRule('Rate Limit', 'Multiple failed login attempts detected.');
            }
            this.triggerHoneypotLure('High');
            return { success: false, message: `Attack (Rate Limit) Blocked by GuardX Firewall.`, log };
        }
    }
    
    // --- Threat Identification (Firewall's perspective on raw payload) ---
    if (req.payload) {
        if (req.payload.includes('<script>') || /onerror|onload|onmouseover/i.test(req.payload)) {
            threat = { type: 'XSS', level: 'High' };
        } else if (/' OR '?\d+'='?\d+/i.test(req.payload) || /; ?--/i.test(req.payload)) {
            threat = { type: 'SQL Injection', level: 'Critical' };
        } else if (req.payload.includes('../')) {
            threat = { type: 'Path Traversal', level: 'High' };
        } else if (req.payload.startsWith('brute-force-attempt-')) {
            threat = { type: 'Brute-Force', level: 'Medium' };
        } else if (req.path === '/products') {
            threat = { type: 'Data Tampering', level: 'Medium' };
        }
    }

    const isThreat = !!threat;
    const blockRequest = isThreat && this.firewallEnabled();
    const action = blockRequest ? 'Blocked' : 'Allowed';
    
    const log = this.createLogEntry(
        threat?.level ?? 'None',
        action,
        threat?.type ?? null,
        req.payload
    );
    
    this.requestLogs.update(logs => [log, ...logs.slice(0, 199)]);
    this.stats.update(s => ({ ...s, totalRequests: s.totalRequests + 1 }));

    if (isThreat) {
        this.stats.update(s => ({...s, threatsDetected: s.threatsDetected + 1}));
    }

    if (blockRequest) {
        this.stats.update(s => ({...s, threatsBlocked: s.threatsBlocked + 1}));
        // This is the trigger for the Adaptive Defense Engine
        this.generateAndDeployAdaptiveRule(threat!.type, req.payload!);
        this.triggerHoneypotLure(threat!.level);
        return { success: false, message: `Attack (${threat?.type}) Blocked by GuardX Firewall.`, log };
    }

    // --- If not blocked, simulate server-side processing based on security level ---
    if (req.path === '/reviews' && req.payload) {
        let processedPayload = req.payload;
        if (securityLevel === 'Medium') {
             // Medium: Strip <script> tags, but not other potential vectors like onerror
            processedPayload = processedPayload.replace(/<script\b[^>]*>.*?<\/script>/gi, '');
        } else if (securityLevel === 'High') {
            // High: Escape all HTML-like characters to prevent rendering
            processedPayload = processedPayload.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        this.targetPageComments.update(c => [processedPayload, ...c]);
    }

    if (req.path === '/login') {
        const isSqlInjectionAttempt = threat?.type === 'SQL Injection';
        // The bypass ONLY works if the attack is SQLi AND security is Low
        if (isSqlInjectionAttempt && securityLevel === 'Low') {
            this.targetPageLoginStatus.set('Login Bypassed!');
        } else {
            // It's a failed login attempt (for brute force or failed SQLi on Med/High)
            const now = Date.now();
            let attempts = this.failedLoginAttempts.get(attackerIp);
            if (!attempts || now - attempts.timestamp > this.RATE_LIMIT_WINDOW) {
                this.failedLoginAttempts.set(attackerIp, { count: 1, timestamp: now });
            } else {
                attempts.count++;
            }
        }
    }

    if (req.path === '/products' && req.payload && securityLevel === 'Low') {
      try {
        const newDetails: Partial<ProductDetails> = {};
        const nameMatch = req.payload.match(/"product_?name":\s*"([^"]*)"/i);
        const descMatch = req.payload.match(/"description":\s*"([^"]*)"/i);
        const priceMatch = req.payload.match(/"(?:product_)?price":\s*(\d+\.?\d*)/i);

        if (nameMatch?.[1]) newDetails.name = nameMatch[1];
        if (descMatch?.[1]) newDetails.description = descMatch[1];
        if (priceMatch?.[1]) newDetails.price = parseFloat(priceMatch[1]);
        
        if (Object.keys(newDetails).length > 0) {
            this.targetProductDetails.update(current => ({ ...current, ...newDetails }));
        }
      } catch (e) {
          console.log("Malformed data tampering payload.");
      }
    }

    return { success: true, message: `Request Allowed. Target processed at ${securityLevel} security.`, log };
  }

  private createLogEntry(level: ThreatLevel, action: ActionTaken, type: string | null = null, payload: string | undefined = undefined): RequestLog {
    const method = (['GET', 'POST', 'PUT', 'DELETE'] as const)[Math.floor(Math.random() * 4)];
    const source = this.ATTACKER_SOURCE;
    return {
      id: `req-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      ip: source.ip,
      country: source.country,
      method: method,
      path: type === 'SQL Injection' || type === 'Brute-Force' ? '/login' : (type === 'Data Tampering' ? '/products' : '/reviews'),
      status: action === 'Blocked' ? 403 : (method === 'POST' ? 201 : 200),
      threatLevel: level,
      threatType: type,
      action: action,
      payload: payload,
      location: { lat: source.lat, lon: source.lon },
      asn: source.asn,
      userAgent: source.userAgent
    };
  }

  private updateUptime() {
    setInterval(() => {
      const diff = Date.now() - this.startTime;
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      this.stats.update(s => ({...s, uptime: `${d}d ${h}h ${m}m`}));
    }, 1000 * 60);
  }

  private initializeHoneypot(): void {
    setTimeout(() => {
      this.honeypotStats.update(stats => ({ ...stats, status: 'Active' }));
    }, 2500);
  }

  private triggerHoneypotLure(level: ThreatLevel): void {
    this.honeypotStats.update(stats => {
      const isHighSeverity = level === 'Critical' || level === 'High';
      return {
        luredAttackers: stats.luredAttackers + 1,
        status: isHighSeverity ? 'Under Attack' : stats.status,
      };
    });

    // If status was changed to 'Under Attack', reset it after a while
    if (this.honeypotStats().status === 'Under Attack') {
      setTimeout(() => {
        this.honeypotStats.update(stats => {
            // Only revert if it's still 'Under Attack', to avoid race conditions
            if (stats.status === 'Under Attack') {
                return { ...stats, status: 'Active' };
            }
            return stats;
        });
      }, 5000); // Revert to active after 5 seconds
    }
  }

  async generateAndDeployAdaptiveRule(threatType: string, payload: string): Promise<void> {
    if (!this.ai) return;

    // Prevent duplicate rules for the same threat type
    const existingRules = this.adaptiveRules();
    if (existingRules.some(rule => rule.threatType === threatType)) {
      console.log(`Adaptive rule for ${threatType} already exists. Skipping.`);
      return;
    }

    const prompt = `
      You are a WAF (Web Application Firewall) security analyst.
      An attack with the type "${threatType}" containing the following payload was just blocked:
      PAYLOAD: "${payload}"
      
      Your task is to create a brief, human-readable description for a new dynamic firewall rule to mitigate this threat vector.
      The description should be a single sentence, starting with "Block requests that..."
      
      Example for XSS: "Block requests that appear to contain cross-site scripting probes."
      Example for SQL Injection: "Block requests attempting to exploit the database via SQL injection."

      Return a JSON object with one key: "description".
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
            },
            required: ['description']
          },
        },
      });

      const resultText = response.text;
      const resultJson = JSON.parse(resultText);

      const newRule: AdaptiveRule = {
        id: `rule-${Date.now()}`,
        timestamp: new Date(),
        threatType: threatType,
        description: resultJson.description,
        sourcePayload: payload,
        status: 'Active',
      };
      
      this.adaptiveRules.update(rules => [newRule, ...rules]);
      this.stats.update(s => ({...s, adaptiveRules: s.adaptiveRules + 1 }));

    } catch (error) {
      console.error('Error generating adaptive rule with Gemini:', error);
    }
  }

  async generatePayloadFromPrompt(options: { prompt: string, target?: string }): Promise<void> {
    if (!this.ai) {
      this.aiPayloadError.set("AI service is not initialized.");
      return;
    }
    
    this.isLoadingAiPayload.set(true);
    this.aiPayloadError.set(null);
    this.aiGeneratedPayload.set(null);

    const level = this.securityLevel();
    const { prompt, target } = options;

    const fullPrompt = `
      You are an expert security penetration tester. Your task is to generate a functional, example attack payload based on a user's natural language request.
      The payload MUST be tailored for the specified web application security level. Be creative and attempt to bypass common filters.
      
      Security Level Definitions:
      - Low: No filtering. Basic payloads work.
      - Medium: Basic filtering is active. For XSS, '<script>' tags are stripped but other vectors like 'onerror', 'onload', SVG, or other HTML tags might work. For SQLi, basic quote escaping is active, so simple "' OR 1=1" attacks will fail. Try to use techniques that don't rely on single quotes.
      - High: Strong filtering and sanitization. All HTML is escaped, and parameterized queries are simulated, making these attacks likely impossible.

      Current Security Level: "${level}"
      User Request: "${prompt}"
      ${target ? `The payload will be injected into a parameter named: "${target}"` : ''}

      Generate a payload that would be effective at the "${level}" security level. 
      If an attack is not feasible at this level (especially 'High'), state that clearly in the description and provide an empty or harmless payload.
      Provide your response in the structured JSON format as defined by the schema. Be concise.
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              payload: { type: Type.STRING, description: 'The generated attack payload code snippet. Should be harmless if the attack is not feasible.' },
              attackType: { type: Type.STRING, description: 'The category of the attack (e.g., XSS, SQL Injection).' },
              description: { type: Type.STRING, description: 'A brief, one-sentence explanation of what the payload does and why it works (or does not work) at the current security level.' },
            },
            required: ['payload', 'attackType', 'description']
          },
        },
      });

      const resultText = response.text;
      const resultJson = JSON.parse(resultText);
      this.aiGeneratedPayload.set(resultJson as PayloadGeneratorResult);
    } catch (error) {
      console.error('Error generating payload with Gemini:', error);
      this.aiPayloadError.set('Failed to generate payload. The AI service may be unavailable or the request was malformed.');
    } finally {
      this.isLoadingAiPayload.set(false);
    }
  }
  
  async analyzePayload(payload: string): Promise<void> {
    if (!this.ai) {
      this.analysisError.set("AI service is not initialized.");
      return;
    }
    
    this.isLoadingAnalysis.set(true);
    this.analysisError.set(null);
    this.analysisResult.set(null);

    const prompt = `
      You are a WAF (Web Application Firewall) security analyst.
      Analyze the provided code snippet which is a suspicious web request payload.
      Identify the attack vector, explain the potential damage, and suggest a generic firewall rule to mitigate it.
      Provide your response in the structured JSON format as defined by the schema.
      Payload: "${payload}"
    `;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              threatType: { type: Type.STRING, description: 'e.g., SQL Injection, Cross-Site Scripting (XSS)' },
              severity: { type: Type.STRING, description: 'e.g., Critical, High, Medium, Low' },
              explanation: { type: Type.STRING, description: 'A detailed explanation of the threat and potential impact.' },
              suggestedRule: { type: Type.STRING, description: 'A generic, human-readable rule to block this type of attack.' },
            },
            required: ['threatType', 'severity', 'explanation', 'suggestedRule']
          },
        },
      });

      const resultText = response.text;
      const resultJson = JSON.parse(resultText);
      this.analysisResult.set(resultJson as ThreatAnalysisResult);
    } catch (error) {
      console.error('Error analyzing payload with Gemini:', error);
      this.analysisError.set('Failed to analyze the payload. The AI service may be unavailable or the request was malformed.');
    } finally {
      this.isLoadingAnalysis.set(false);
    }
  }
}