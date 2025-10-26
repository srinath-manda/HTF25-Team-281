import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LiveTrafficComponent } from './components/live-traffic/live-traffic.component';
import { AdaptiveDefenseComponent } from './components/adaptive-defense/adaptive-defense.component';
import { AboutComponent } from './components/about/about.component';
import { WafService } from './services/waf.service';
import { ViewType, SecurityLevel } from './types';
import { TargetComponent } from './components/target/target.component';
import { AttackerComponent } from './components/attacker/attacker.component';
import { ThreatModelComponent } from './components/threat-model/threat-model.component';
import { ServerTerminalComponent } from './components/server-terminal/server-terminal.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardComponent, LiveTrafficComponent, AdaptiveDefenseComponent, AboutComponent, TargetComponent, AttackerComponent, ThreatModelComponent, ServerTerminalComponent],
})
export class AppComponent {
  wafService = inject(WafService);
  activeView = this.wafService.activeView;
  firewallEnabled = this.wafService.firewallEnabled;
  securityLevel = this.wafService.securityLevel;

  setView(view: ViewType) {
    this.wafService.setActiveView(view);
  }

  toggleFirewall() {
    this.wafService.toggleFirewall();
  }

  setSecurityLevel(level: SecurityLevel) {
    this.wafService.setSecurityLevel(level);
  }
}