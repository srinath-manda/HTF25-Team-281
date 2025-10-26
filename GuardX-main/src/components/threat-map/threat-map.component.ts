import { Component, ChangeDetectionStrategy, inject, ElementRef, AfterViewInit, effect, signal } from '@angular/core';
import { WafService } from '../../services/waf.service';
import { RequestLog, ThreatLevel } from '../../types';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

@Component({
  selector: 'app-threat-map',
  standalone: true,
  templateUrl: './threat-map.component.html',
  styleUrls: ['./threat-map.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreatMapComponent implements AfterViewInit {
  private wafService = inject(WafService);
  private el = inject(ElementRef);
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private projection: d3.GeoProjection;
  private width: number;
  private height: number;
  private targetCoords: [number, number] = [-78.4, 38.0]; // Virginia, US

  private mapInitialized = signal(false);
  private lastLogTimestamp = new Date(0);

  constructor() {
    this.width = 0;
    this.height = 0;

    effect(() => {
      if (!this.mapInitialized()) {
        return;
      }

      const logs = this.wafService.requestLogs();
      const newThreats = logs.filter(log => 
        log.threatLevel !== 'None' && log.timestamp > this.lastLogTimestamp
      );
      
      if (newThreats.length > 0) {
        this.lastLogTimestamp = newThreats[0].timestamp; 
        newThreats.forEach(threat => this.addThreatArc(threat));
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
        this.setupMap();
        window.addEventListener('resize', this.resizeMap.bind(this));
    }, 0);
  }

  private setupMap(): void {
    const container = this.el.nativeElement.querySelector('.map-container');
    if (!container || container.clientWidth === 0) return;
    
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.svg = d3.select(container)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .style('background-color', '#1a2234');

    this.projection = d3.geoMercator()
      .scale(this.width / 2 / Math.PI * 0.85)
      .translate([this.width / 2, this.height / 1.6]);

    const path = d3.geoPath().projection(this.projection);

    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then((world: any) => {
      if(!world) return;
      const countries = topojson.feature(world, world.objects.countries);
      this.svg.append('g')
        .selectAll('path')
        .data(countries.features)
        .enter().append('path')
        .attr('d', path)
        .attr('fill', '#2c3a58')
        .attr('stroke', '#121828')
        .attr('stroke-width', 0.5);
      
      this.drawTarget();
      this.mapInitialized.set(true);
    });
  }

  private drawTarget(): void {
      const target = this.projection(this.targetCoords);
      if (!target) return;

      // Add a pulsing outer circle
      this.svg.append('circle')
        .attr('cx', target[0])
        .attr('cy', target[1])
        .attr('r', 10)
        .attr('fill', 'none')
        .attr('stroke', '#22d3ee')
        .attr('stroke-width', 2)
        .attr('class', 'pulse');
      
      // Add a solid inner circle
      this.svg.append('circle')
        .attr('cx', target[0])
        .attr('cy', target[1])
        .attr('r', 4)
        .attr('fill', '#22d3ee');
  }

  private resizeMap(): void {
     if (!this.mapInitialized()) return;
     const container = this.el.nativeElement.querySelector('.map-container');
     if (!container) return;

     this.width = container.clientWidth;
     this.height = container.clientHeight;

     this.svg.attr('width', this.width).attr('height', this.height);
     
     this.projection.scale(this.width / 2 / Math.PI * 0.85)
        .translate([this.width / 2, this.height / 1.6]);
     
     const path = d3.geoPath().projection(this.projection);
     this.svg.selectAll('path').attr('d', path);
     this.svg.selectAll('.target-marker').remove();
     this.svg.selectAll('.pulse').remove();
     this.drawTarget();
  }

  private getThreatColor(level: ThreatLevel): string {
    switch (level) {
      case 'Critical': return '#ef4444'; // red-500
      case 'High': return '#f97316'; // orange-500
      case 'Medium': return '#eab308'; // yellow-500
      case 'Low': return '#3b82f6'; // blue-500
      default: return '#9ca3af'; // gray-400
    }
  }

  private addThreatArc(threat: RequestLog): void {
    const source = this.projection([threat.location.lon, threat.location.lat]);
    const target = this.projection(this.targetCoords);
    if (!source || !target) return;

    const link = {
        type: "LineString",
        coordinates: [
            [threat.location.lon, threat.location.lat],
            this.targetCoords
        ]
    };

    const pathGenerator = d3.geoPath().projection(this.projection);
    const pathElement = this.svg.append("path")
        .attr("d", pathGenerator(link as any))
        .style("fill", "none")
        .style("stroke", this.getThreatColor(threat.threatLevel))
        .style("stroke-width", 1.5)
        .style("opacity", 0.8);
    
    const length = pathElement.node()?.getTotalLength() ?? 0;

    pathElement.attr("stroke-dasharray", length + " " + length)
        .attr("stroke-dashoffset", length)
        .transition()
        .duration(1500)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0)
        .transition()
        .duration(500)
        .style("opacity", 0)
        .remove();
  }
}