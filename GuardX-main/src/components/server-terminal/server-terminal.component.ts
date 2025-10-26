import { Component, ChangeDetectionStrategy, signal, WritableSignal, inject, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WafService } from '../../services/waf.service';

interface TerminalOutput {
  command?: string;
  response: string;
  isCommand: boolean;
}

@Component({
  selector: 'app-server-terminal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './server-terminal.component.html',
  styleUrls: ['./server-terminal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerTerminalComponent implements AfterViewChecked {
  @ViewChild('terminalOutput') private terminalOutput: ElementRef;
  private wafService = inject(WafService);

  currentCommand = signal('');
  commandHistory: WritableSignal<string[]> = signal([]);
  output: WritableSignal<TerminalOutput[]> = signal([]);

  private readonly initialMessage = `
GuardX Secure Server Environment (v1.3.0)
Last login: ${new Date().toUTCString()} from 192.168.1.10
------------------------------------------------------------------
This is a restricted and monitored environment.
Direct external scanning (e.g., nmap from the internet) is blocked by network ACLs.
Use this terminal for authorized diagnostics.
Type 'help' for a list of available commands.
------------------------------------------------------------------
  `;

  constructor() {
    this.output.set([{ response: this.initialMessage, isCommand: false }]);
  }
  
  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }
  
  private scrollToBottom(): void {
    try {
      this.terminalOutput.nativeElement.scrollTop = this.terminalOutput.nativeElement.scrollHeight;
    } catch(err) { } 
  }

  handleCommand() {
    const command = this.currentCommand().trim();
    if (!command) return;
    
    this.commandHistory.update(h => [...h, command]);

    const commandOutput: TerminalOutput = { command: command, response: '', isCommand: true };
    this.output.update(o => [...o, commandOutput]);
    
    let responseText = '';
    const parts = command.split(' ');
    const baseCommand = parts[0].toLowerCase();

    switch (baseCommand) {
      case 'help':
        responseText = `
  GuardX Server Terminal - Available Commands:
  -------------------------------------------
  help              - Show this help message.
  status            - Display current WAF and server status.
  nmap localhost    - Simulate a port scan on this server.
  ls -la            - List files in the current directory.
  cat <file>        - Display file content (e.g., cat logs/waf.log).
  whoami            - Display the current user.
  history           - Show command history.
  clear             - Clear the terminal screen.

  To simulate external attacks (e.g., from sqlmap, Burp Suite):
  1. Generate the malicious payload in your tool of choice.
  2. Navigate to the 'Attacker Tools' page in this application.
  3. Paste the payload into the 'Manual Attack' tool and launch.
        `;
        break;

      case 'status':
        const firewallStatus = this.wafService.firewallEnabled() ? 'ACTIVE' : 'DISABLED';
        const securityLevel = this.wafService.securityLevel();
        responseText = `
  GuardX WAF Status:
    Firewall...: ${firewallStatus}
    Security...: ${securityLevel}
    Rules Active: ${this.wafService.stats().adaptiveRules + 4} (4 static, ${this.wafService.stats().adaptiveRules} adaptive)
    Uptime.....: ${this.wafService.stats().uptime}

  Server Status:
    CPU Load...: 15.2%
    Memory.....: 4.8GiB / 16.0GiB
    Public IP..: 45.79.124.118 (simulated)
    Domain.....: sim.guardx.io
        `;
        break;

      case 'nmap':
        if (parts[1] === 'localhost') {
            responseText = `
  Starting Nmap 7.92 ( https://nmap.org ) at ${new Date().toISOString()}
  Nmap scan report for sim.guardx.io (localhost)
  Host is up (0.00010s latency).
  Not shown: 998 filtered tcp ports (no-response)
  PORT    STATE   SERVICE
  80/tcp  open    http      (Protected by GuardX WAF)
  443/tcp open    https     (Protected by GuardX WAF)
  
  Nmap done: 1 IP address (1 host up) scanned in 2.58 seconds.
            `;
        } else {
            responseText = "Error: nmap target must be 'localhost'. External scanning is disabled.";
        }
        break;
        
      case 'ls':
        if (parts[1] === '-la') {
            responseText = `
total 24
drwxr-xr-x 4 guardx-user guardx-group 4096 Jul 15 10:30 .
drwxr-xr-x 3 root        root         4096 Jul 14 09:00 ..
-rw-r--r-- 1 guardx-user guardx-group  220 Jul 14 09:00 .bash_logout
-rw-r--r-- 1 guardx-user guardx-group 3771 Jul 14 09:00 .bashrc
drwxr-xr-x 2 guardx-user guardx-group 4096 Jul 15 11:00 app
drwxr-xr-x 2 guardx-user guardx-group 4096 Jul 15 11:05 logs
`
        } else {
            responseText = "usage: ls -la";
        }
        break;

      case 'cat':
        if (parts[1] === 'logs/waf.log') {
            const logs = this.wafService.requestLogs().slice(0, 10);
            if (logs.length === 0) {
                responseText = "[WAF] Log file is empty.";
            } else {
                responseText = logs.map(log => 
                    `[${log.timestamp.toISOString()}] [${log.action}] [${log.threatType || 'N/A'}] SRC=${log.ip} DST=${log.path} PAYLOAD="${(log.payload || '').substring(0, 50)}..."`
                ).join('\n');
            }
        } else {
            responseText = `cat: ${parts[1] || ''}: No such file or directory`;
        }
        break;
      
      case 'whoami':
        responseText = 'guardx-user';
        break;

      case 'history':
        responseText = this.commandHistory().map((cmd, i) => `  ${i+1}  ${cmd}`).join('\n');
        break;

      case 'clear':
        this.output.set([]);
        break;

      default:
        responseText = `command not found: ${command}`;
        break;
    }

    this.output.update(o => [...o, { response: responseText, isCommand: false }]);
    this.currentCommand.set('');
  }
}
