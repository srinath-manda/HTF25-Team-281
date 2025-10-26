import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { WafService } from '../../services/waf.service';
import { CommonModule } from '@angular/common';
import { ThreatMapComponent } from '../threat-map/threat-map.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ThreatMapComponent],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private wafService = inject(WafService);
  stats = this.wafService.stats;
  recentThreats = computed(() => 
    this.wafService.requestLogs().filter(log => log.threatLevel !== 'None').slice(0, 5)
  );
  
  honeypotStats = this.wafService.honeypotStats;

  threatTypeCounts = computed(() => {
    const counts = new Map<string, number>();
    this.wafService.requestLogs()
      .filter(log => log.threatType)
      .forEach(log => {
        counts.set(log.threatType!, (counts.get(log.threatType!) || 0) + 1);
      });
    return Array.from(counts.entries()).sort((a,b) => b[1] - a[1]);
  });
  
  maxThreatCount = computed(() => {
    const counts = this.threatTypeCounts().map(entry => entry[1]);
    return Math.max(...counts, 1);
  });

  getSeverityClass(level: string) {
    switch (level) {
      case 'Critical': return 'text-red-500';
      case 'High': return 'text-orange-500';
      case 'Medium': return 'text-yellow-500';
      case 'Low': return 'text-blue-500';
      default: return 'text-gray-400';
    }
  }
}