import { NextResponse } from 'next/server';
import {
  getHourlyPerformance,
  getSessionPerformance,
  getUnderlyingPerformance,
  getSetupPerformance,
  getWeekdayPerformance,
} from '@/lib/db';

export async function GET() {
  try {
    const hourly = getHourlyPerformance();
    const sessions = getSessionPerformance();
    const symbols = getUnderlyingPerformance();
    const setups = getSetupPerformance();
    const weekdays = getWeekdayPerformance() as Array<{
      weekday: string;
      weekday_num: number;
      trade_count: number;
      win_rate: number;
      total_pnl: number;
      avg_pnl: number;
    }>;

    // Find best performing areas (positive P/L only)
    const profitableHours = hourly.filter(h => h.total_pnl > 0);
    const bestHour = profitableHours.length > 0
      ? profitableHours.reduce((best, curr) => curr.total_pnl > best.total_pnl ? curr : best)
      : null;

    const profitableSessions = sessions.filter(s => s.total_pnl > 0);
    const bestSession = profitableSessions.length > 0
      ? profitableSessions.reduce((best, curr) => curr.total_pnl > best.total_pnl ? curr : best)
      : null;

    const profitableSymbols = symbols.filter(s => s.total_pnl > 0);
    const bestSymbol = profitableSymbols.length > 0
      ? profitableSymbols.reduce((best, curr) => curr.total_pnl > best.total_pnl ? curr : best)
      : null;

    const profitableSetups = setups.filter(s => s.total_pnl > 0);
    const bestSetup = profitableSetups.length > 0
      ? profitableSetups.reduce((best, curr) => curr.total_pnl > best.total_pnl ? curr : best)
      : null;

    const profitableDays = weekdays.filter(d => d.total_pnl > 0);
    const bestDay = profitableDays.length > 0
      ? profitableDays.reduce((best, curr) => curr.total_pnl > best.total_pnl ? curr : best)
      : null;

    // Calculate edge score (based on consistency and profitability)
    const calculateEdgeScore = (winRate: number, avgPnl: number, tradeCount: number) => {
      // Weight: 40% win rate, 40% avg P/L (normalized), 20% sample size
      const winRateScore = winRate;
      const avgPnlScore = Math.min(100, Math.max(0, avgPnl + 50)); // Normalize to 0-100ish
      const sampleScore = Math.min(100, tradeCount * 5); // 20 trades = max score
      return (winRateScore * 0.4 + avgPnlScore * 0.4 + sampleScore * 0.2);
    };

    // Build edge summary
    const edges = [];

    if (bestSymbol) {
      edges.push({
        type: 'symbol' as const,
        label: bestSymbol.underlying,
        totalPnl: bestSymbol.total_pnl,
        winRate: bestSymbol.win_rate,
        tradeCount: bestSymbol.trade_count,
        avgPnl: bestSymbol.avg_pnl,
        edgeScore: calculateEdgeScore(bestSymbol.win_rate, bestSymbol.avg_pnl, bestSymbol.trade_count),
      });
    }

    if (bestHour) {
      edges.push({
        type: 'time' as const,
        label: `${bestHour.hour}:00`,
        totalPnl: bestHour.total_pnl,
        winRate: bestHour.win_rate,
        tradeCount: bestHour.trade_count,
        avgPnl: bestHour.avg_pnl,
        edgeScore: calculateEdgeScore(bestHour.win_rate, bestHour.avg_pnl, bestHour.trade_count),
      });
    }

    if (bestSession) {
      edges.push({
        type: 'session' as const,
        label: bestSession.session.charAt(0).toUpperCase() + bestSession.session.slice(1),
        totalPnl: bestSession.total_pnl,
        winRate: bestSession.win_rate,
        tradeCount: bestSession.trade_count,
        avgPnl: bestSession.avg_pnl,
        edgeScore: calculateEdgeScore(bestSession.win_rate, bestSession.avg_pnl, bestSession.trade_count),
      });
    }

    if (bestDay) {
      edges.push({
        type: 'day' as const,
        label: bestDay.weekday,
        totalPnl: bestDay.total_pnl,
        winRate: bestDay.win_rate,
        tradeCount: bestDay.trade_count,
        avgPnl: bestDay.avg_pnl,
        edgeScore: calculateEdgeScore(bestDay.win_rate, bestDay.avg_pnl, bestDay.trade_count),
      });
    }

    if (bestSetup) {
      edges.push({
        type: 'setup' as const,
        label: bestSetup.setup_type,
        totalPnl: bestSetup.total_pnl,
        winRate: bestSetup.win_rate,
        tradeCount: bestSetup.trade_count,
        avgPnl: bestSetup.avg_pnl,
        edgeScore: calculateEdgeScore(bestSetup.win_rate, bestSetup.avg_pnl, bestSetup.trade_count),
      });
    }

    // Sort by edge score
    edges.sort((a, b) => b.edgeScore - a.edgeScore);

    // Calculate total edge potential (sum of all profitable areas)
    const totalEdgePnl = edges.reduce((sum, e) => sum + e.totalPnl, 0);

    // Generate actionable recommendation
    const topEdge = edges[0];
    const recommendation = topEdge
      ? `Your strongest edge is ${topEdge.type === 'symbol' ? `trading ${topEdge.label}` :
         topEdge.type === 'time' ? `trading at ${topEdge.label}` :
         topEdge.type === 'session' ? `the ${topEdge.label.toLowerCase()} session` :
         topEdge.type === 'day' ? `trading on ${topEdge.label}s` :
         `the ${topEdge.label} setup`} with ${topEdge.winRate}% win rate and $${topEdge.avgPnl.toFixed(2)} average.`
      : 'Keep trading to discover your edge.';

    return NextResponse.json({
      edges,
      totalEdgePnl,
      recommendation,
      details: {
        profitableHours,
        profitableSymbols,
        profitableSetups,
        profitableSessions,
        profitableDays,
      },
    });
  } catch (error) {
    console.error('Error fetching edge data:', error);
    return NextResponse.json({ error: 'Failed to fetch edge data' }, { status: 500 });
  }
}
