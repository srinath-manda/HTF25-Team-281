
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WafService } from '../../services/waf.service';
import { ThreatLevel } from '../../types';

@Component({
  selector: 'app-live-traffic',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './live-traffic.component.html',
  styleUrls: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveTrafficComponent {
  wafService = inject(WafService);
  logs = this.wafService.requestLogs;

  getThreatColor(level: ThreatLevel): string {
    switch(level) {
      case 'Critical': return 'border-red-500 bg-red-900/20';
      case 'High': return 'border-orange-500 bg-orange-900/20';
      case 'Medium': return 'border-yellow-500 bg-yellow-900/20';
      case 'Low': return 'border-blue-500 bg-blue-900/20';
      default: return 'border-gray-700';
    }
  }

  getActionBadge(action: string): string {
     switch (action) {
      case 'Blocked': return 'bg-red-500/20 text-red-400';
      case 'Monitored': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-green-500/20 text-green-400';
    }
  }
}
