import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WafService } from '../../services/waf.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TargetLoginStatus, SecurityLevel } from '../../types';

@Component({
  selector: 'app-target',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './target.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetComponent {
  private wafService = inject(WafService);
  private sanitizer = inject(DomSanitizer);

  firewallEnabled = this.wafService.firewallEnabled;
  comments = this.wafService.targetPageComments;
  loginStatus = this.wafService.targetPageLoginStatus;
  securityLevel = this.wafService.securityLevel;
  productDetails = this.wafService.targetProductDetails;

  // This is intentionally insecure for demonstration purposes.
  // In a real app, you should NEVER bypass security without extreme care.
  sanitizeAndTrustHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  getLoginStatusClass(status: TargetLoginStatus): string {
    switch (status) {
      case 'Logged In':
        return 'text-green-400';
      case 'Login Bypassed!':
        return 'text-red-500 font-bold animate-pulse';
      case 'Logged Out':
      default:
        return 'text-gray-400';
    }
  }

  getSecurityLevelClass(level: SecurityLevel): string {
    switch (level) {
      case 'Low':
        return 'bg-green-500/20 text-green-300';
      case 'Medium':
        return 'bg-yellow-500/20 text-yellow-300';
      case 'High':
        return 'bg-red-500/20 text-red-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
    }
  }
}
