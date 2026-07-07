import { ref, type Ref } from 'vue';
import { stations, stationMap, lines, lookupDistance, getPreset } from './useMapData';

export type RouteMetric = 'fare' | 'time' | 'distance';

export const METRIC_LABELS: Record<RouteMetric, string> = {
  fare: '票价最低',
  time: '时间最短',
  distance: '路程最短',
};

export interface NodeInfo {
  stationId: string;
  lineId: string;
  stationName: string;
  stationNameEn: string;
  lineName: string;
  lineNameEn: string;
}

export interface RouteSegment {
  lineId: string;
  lineName: string;
  lineNameEn: string;
  isFerry: boolean;
  isSameStation: boolean;
  nodes: NodeInfo[];
  fare: number;
  time: number;
  distance: number;
}

export interface RouteResult {
  segments: RouteSegment[];
  pathNodeIds: string[];
  totalFare: number;
  totalTime: number;
  totalDistance: number;
}

export interface StationSuggestion {
  id: string;
  name: string;
  nameEn: string;
  lines: { id: string; name: string; nameEn: string }[];
}

interface EdgeMetrics {
  fare: number;
  time: number;
  distance: number;
}

const graph = new Map<string, Map<string, number>>();
const edgeMetrics = new Map<string, Map<string, EdgeMetrics>>();
const stationNodeMap = new Map<string, string[]>();
const nodeInfoMap = new Map<string, NodeInfo>();

function addEdge(a: string, b: string, w: number, m?: EdgeMetrics) {
  if (!graph.has(a)) graph.set(a, new Map());
  if (!graph.has(b)) graph.set(b, new Map());
  graph.get(a)!.set(b, w);
  graph.get(b)!.set(a, w);
  if (m) {
    if (!edgeMetrics.has(a)) edgeMetrics.set(a, new Map());
    if (!edgeMetrics.has(b)) edgeMetrics.set(b, new Map());
    edgeMetrics.get(a)!.set(b, m);
    edgeMetrics.get(b)!.set(a, m);
  }
}

const seenNodes = new Set<string>();

for (const line of lines) {
  for (const [sid] of line.stations) {
    const st = stationMap.get(sid);
    if (!st) continue;

    const nodeId = `${sid}-${line.id}`;

    if (!seenNodes.has(nodeId)) {
      seenNodes.add(nodeId);
      nodeInfoMap.set(nodeId, {
        stationId: sid,
        lineId: line.id,
        stationName: st.name,
        stationNameEn: st.nameEn,
        lineName: line.name,
        lineNameEn: line.nameEn,
      });

      if (!stationNodeMap.has(sid)) stationNodeMap.set(sid, []);
      stationNodeMap.get(sid)!.push(nodeId);
    }
  }

  for (let i = 0; i < line.stations.length - 1; i++) {
    const [aId] = line.stations[i];
    const [bId] = line.stations[i + 1];
    const aSt = stationMap.get(aId);
    const bSt = stationMap.get(bId);
    if (!aSt || !bSt) continue;
    const dist = lookupDistance(aId, bId);
    const preset = getPreset(line.costPreset);
    const fare = Math.round(dist * preset.farePerKm);
    const time = Math.round(dist * preset.minutesPerKm);
    addEdge(`${aId}-${line.id}`, `${bId}-${line.id}`, fare, {
      fare,
      time,
      distance: dist,
    });
  }
}

for (const [, nodes] of stationNodeMap) {
  if (nodes.length < 2) continue;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      addEdge(nodes[i], nodes[j], 0);
    }
  }
}

export const selectTarget = ref<'start' | 'end' | null>(null);

export function useRouting() {
  function searchStations(query: string): StationSuggestion[] {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase().trim();
    const results: StationSuggestion[] = [];

    for (const st of stations) {
      const nameMatch = st.name.toLowerCase().includes(q);
      const nameEnMatch = st.nameEn.toLowerCase().includes(q);
      const idMatch = st.id.toLowerCase().includes(q);
      const shortId = st.id.split('-').slice(1).join('-').toLowerCase();
      const shortIdMatch = shortId.includes(q);

      if (!nameMatch && !nameEnMatch && !idMatch && !shortIdMatch) continue;

      const lineNodes = stationNodeMap.get(st.id) || [];
      const seenLines = new Set<string>();
      const lineInfo: { id: string; name: string; nameEn: string }[] = [];
      for (const nodeId of lineNodes) {
        const info = nodeInfoMap.get(nodeId);
        if (info && !seenLines.has(info.lineId)) {
          seenLines.add(info.lineId);
          lineInfo.push({ id: info.lineId, name: info.lineName, nameEn: info.lineNameEn });
        }
      }

      results.push({ id: st.id, name: st.name, nameEn: st.nameEn, lines: lineInfo });
    }

    return results.slice(0, 20);
  }

  function findRoute(
    startStationId: string,
    endStationId: string,
    metric: RouteMetric = 'fare',
  ): RouteResult | null {
    const startNodes = stationNodeMap.get(startStationId);
    const endNodes = stationNodeMap.get(endStationId);

    if (!startNodes || startNodes.length === 0) return null;
    if (!endNodes || endNodes.length === 0) return null;

    const getWeight = (a: string, b: string): number => {
      const m = edgeMetrics.get(a)?.get(b);
      if (!m) return 0;
      switch (metric) {
        case 'fare':
          return m.fare;
        case 'time':
          return m.time;
        case 'distance':
          return m.distance;
      }
    };

    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    const visited = new Set<string>();
    const pq: [number, string][] = [];

    for (const node of startNodes) {
      dist.set(node, 0);
      prev.set(node, null);
      pq.push([0, node]);
    }

    const endSet = new Set(endNodes);
    let bestEnd: string | null = null;

    while (pq.length > 0) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, current] = pq.shift()!;
      if (d !== dist.get(current)) continue;
      if (visited.has(current)) continue;
      visited.add(current);

      if (endSet.has(current)) {
        bestEnd = current;
        break;
      }

      const neighbors = graph.get(current);
      if (!neighbors) continue;

      for (const [next] of neighbors) {
        if (visited.has(next)) continue;
        const w = getWeight(current, next);
        const nd = d + w;
        if (!dist.has(next) || nd < dist.get(next)!) {
          dist.set(next, nd);
          prev.set(next, current);
          pq.push([nd, next]);
        }
      }
    }

    if (!bestEnd) return null;

    const pathNodes: string[] = [];
    let cur: string | null = bestEnd;
    while (cur !== null) {
      pathNodes.unshift(cur);
      cur = prev.get(cur) ?? null;
    }

    let totalFare = 0;
    let totalTime = 0;
    let totalDistance = 0;
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const m = edgeMetrics.get(pathNodes[i])?.get(pathNodes[i + 1]);
      if (m) {
        totalFare += m.fare;
        totalTime += m.time;
        totalDistance += m.distance;
      }
    }

    const segments: RouteSegment[] = [];
    let currentSeg: RouteSegment | null = null;

    for (let pi = 0; pi < pathNodes.length; pi++) {
      const nodeId = pathNodes[pi];
      const info = nodeInfoMap.get(nodeId);
      if (!info) continue;

      if (!currentSeg || currentSeg.lineId !== info.lineId) {
        currentSeg = {
          lineId: info.lineId,
          lineName: info.lineName,
          lineNameEn: info.lineNameEn,
          isFerry: info.lineId.startsWith('ferry-'),
          isSameStation: info.lineId.startsWith('same-'),
          nodes: [info],
          fare: 0,
          time: 0,
          distance: 0,
        };
        segments.push(currentSeg);
      } else {
        currentSeg.nodes.push(info);
        if (pi > 0) {
          const m = edgeMetrics.get(pathNodes[pi - 1])?.get(pathNodes[pi]);
          if (m) {
            currentSeg.fare += m.fare;
            currentSeg.time += m.time;
            currentSeg.distance += m.distance;
          }
        }
      }
    }

    return { segments, pathNodeIds: pathNodes, totalFare, totalTime, totalDistance };
  }

  function findRoutes(startStationId: string, endStationId: string): RouteResult[] {
    const metrics: RouteMetric[] = ['fare', 'time', 'distance'];
    const results: RouteResult[] = [];
    for (const m of metrics) {
      const r = findRoute(startStationId, endStationId, m);
      if (r) results.push(r);
    }
    return results;
  }

  function formatRoute(result: RouteResult): string {
    if (result.segments.length === 0) return '未找到路径';

    const segs = result.segments;
    const textLines: string[] = [];

    const startNode = segs[0].nodes[0];
    const endNode = segs[segs.length - 1].nodes[segs[segs.length - 1].nodes.length - 1];

    textLines.push(`从 ${startNode.stationName} 出发（${startNode.lineName}）`);

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];

      if (i === 0) {
        if (seg.nodes.length > 1) {
          textLines.push(
            `→ 乘坐 ${seg.lineName}: ${seg.nodes
              .slice(1)
              .map((n) => n.stationName)
              .join(' → ')}`,
          );
        }
        continue;
      }

      const prevSeg = segs[i - 1];
      const getOff = prevSeg.nodes[prevSeg.nodes.length - 1].stationName;
      const prevRode = prevSeg.nodes.length > 1;
      const prefix = prevRode ? `→ 在 ${getOff} 下车，` : `→ `;

      const restStations = seg.nodes
        .slice(1)
        .map((n) => n.stationName)
        .join(' → ');
      const suffix = restStations ? `: ${restStations}` : '';

      if (seg.isSameStation) {
        textLines.push(`${prefix}同站换乘 ${seg.lineName}${suffix}`);
      } else if (seg.isFerry) {
        textLines.push(`${prefix}乘坐轮渡「${seg.lineName}」${suffix}`);
      } else if (prevSeg.isFerry) {
        textLines.push(`→ 在 ${seg.nodes[0].stationName} 下车，换乘 ${seg.lineName}${suffix}`);
      } else {
        textLines.push(`${prefix}换乘 ${seg.lineName}${suffix}`);
      }
    }

    textLines.push(`到达 ${endNode.stationName}`);
    textLines.push(
      `总票价: ${result.totalFare} 摩拉 | 总时间: ${result.totalTime} 分钟 | 总距离: ${result.totalDistance} 千米`,
    );

    return textLines.join('\n');
  }

  return {
    selectTarget,
    searchStations,
    findRoute,
    findRoutes,
    formatRoute,
  };
}
