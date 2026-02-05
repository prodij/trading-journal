'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Area, AreaChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';

interface Trade {
  id: number;
  date: string;
  underlying: string;
  strike: number;
  option_type: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  net_pnl: number;
  setup_type: string | null;
}

interface DailySummary {
  date: string;
  total_trades: number;
  winners: number;
  losers: number;
  win_rate: number;
  net_pnl: number;
  profit_factor: number;
}

interface Stats {
  days_traded: number;
  total_trades: number;
  winners: number;
  losers: number;
  net_pnl: number;
  commissions: number;
  best_day: number;
  worst_day: number;
  avg_daily: number;
  win_rate: string;
}

interface SetupPerf {
  setup_type: string;
  trade_count: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

interface EquityPoint {
  date: string;
  daily_pnl: number;
  cumulative_pnl: number;
}

interface LossDetail {
  id: number;
  date: string;
  underlying: string;
  entry_time: string | null;
  hold_time_minutes: number | null;
  net_pnl: number;
  day_of_week: string;
  entry_hour: number | null;
}

interface LossPatterns {
  byHour: { hour: number; loss_count: number; total_loss: number }[];
  byDay: { day_of_week: string; loss_count: number; total_loss: number }[];
  holdTime: { category: string; avg_hold_time: number; trade_count: number }[];
  worstHour: { hour: number; total_loss: number } | null;
  worstDay: { day_of_week: string; total_loss: number } | null;
}

interface LossesData {
  losses: LossDetail[];
  patterns: LossPatterns;
}

interface HourlyPerformance {
  hour: number;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

interface SessionPerformance {
  session: string;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
}

interface TimeData {
  hourly: HourlyPerformance[];
  sessions: SessionPerformance[];
  insight: { hour: number; savedAmount: number } | null;
}

interface UnderlyingPerformance {
  underlying: string;
  trade_count: number;
  winners: number;
  losers: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  largest_win: number;
  largest_loss: number;
}

interface SymbolData {
  symbols: UnderlyingPerformance[];
  insights: {
    bestSymbol: UnderlyingPerformance | null;
    worstSymbol: UnderlyingPerformance | null;
    profitableTotal: number;
    unprofitableTotal: number;
    focusOn: string[];
    avoid: string[];
  };
}

const equityChartConfig = {
  cumulative_pnl: {
    label: "Cumulative P/L",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

const setupChartConfig = {
  total_pnl: {
    label: "Total P/L",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

const hourlyChartConfig = {
  total_pnl: {
    label: "P/L",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

const symbolChartConfig = {
  total_pnl: {
    label: "Total P/L",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig;

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [setups, setSetups] = useState<SetupPerf[]>([]);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [lossesData, setLossesData] = useState<LossesData | null>(null);
  const [timeData, setTimeData] = useState<TimeData | null>(null);
  const [symbolData, setSymbolData] = useState<SymbolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tradesRes, statsRes, setupsRes, equityRes, lossesRes, timeRes, symbolRes] = await Promise.all([
          fetch('/api/trades'),
          fetch('/api/stats'),
          fetch('/api/setups'),
          fetch('/api/equity'),
          fetch('/api/losses'),
          fetch('/api/time-performance'),
          fetch('/api/symbol-performance'),
        ]);

        const tradesData = await tradesRes.json();
        const statsData = await statsRes.json();
        const setupsData = await setupsRes.json();
        const equityData = await equityRes.json();
        const lossesJson = await lossesRes.json();
        const timeJson = await timeRes.json();

        setTrades(tradesData.trades || []);
        setSummaries(tradesData.summaries || []);
        setStats(statsData.stats);
        setSetups(setupsData.setups || []);
        setEquity(equityData.equity || []);
        setLossesData(lossesJson);
        setTimeData(timeJson);
        const symbolJson = await symbolRes.json();
        setSymbolData(symbolJson);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const todayTrades = trades.filter(t => t.date === new Date().toISOString().split('T')[0]);
  const todaySummary = summaries.find(s => s.date === new Date().toISOString().split('T')[0]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Trading Journal</h1>
            <p className="text-muted-foreground">Track, analyze, improve</p>
          </div>
          <Badge variant={stats && stats.net_pnl >= 0 ? "default" : "destructive"} className="text-lg px-4 py-2">
            {stats ? `$${stats.net_pnl.toFixed(2)}` : '$0.00'} (30d)
          </Badge>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Net P/L (30d)</CardDescription>
              <CardTitle className={`text-2xl ${stats && stats.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${stats?.net_pnl.toFixed(2) || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Win Rate</CardDescription>
              <CardTitle className="text-2xl">{stats?.win_rate || 0}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Trades</CardDescription>
              <CardTitle className="text-2xl">{stats?.total_trades || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg Daily P/L</CardDescription>
              <CardTitle className={`text-2xl ${stats && stats.avg_daily >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${stats?.avg_daily.toFixed(2) || '0.00'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="losses">Losses</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
            <TabsTrigger value="symbols">Symbols</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="setups">Setups</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Equity Curve */}
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Equity Curve</CardTitle>
                  <CardDescription>Cumulative P/L over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={equityChartConfig} className="h-[300px] w-full">
                    <AreaChart data={equity} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Area
                        type="monotone"
                        dataKey="cumulative_pnl"
                        stroke="var(--color-cumulative_pnl)"
                        fill="var(--color-cumulative_pnl)"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Today's Trades */}
              <Card>
                <CardHeader>
                  <CardTitle>Today's Trades</CardTitle>
                  <CardDescription>
                    {todaySummary ? `${todaySummary.winners}W / ${todaySummary.losers}L • $${todaySummary.net_pnl.toFixed(2)}` : 'No trades today'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {todayTrades.length > 0 ? (
                    <div className="space-y-2">
                      {todayTrades.map((trade) => (
                        <div key={trade.id} className="flex justify-between items-center p-2 bg-muted rounded">
                          <div>
                            <span className="font-mono">${trade.strike} {trade.option_type}</span>
                            {trade.setup_type && (
                              <Badge variant="outline" className="ml-2 text-xs">{trade.setup_type}</Badge>
                            )}
                          </div>
                          <span className={trade.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                            ${trade.net_pnl.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No trades recorded today</p>
                  )}
                </CardContent>
              </Card>

              {/* Setup Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Setup Performance</CardTitle>
                  <CardDescription>P/L by setup type</CardDescription>
                </CardHeader>
                <CardContent>
                  {setups.length > 0 ? (
                    <ChartContainer config={setupChartConfig} className="h-[200px] w-full">
                      <BarChart data={setups} layout="vertical" margin={{ left: 80 }}>
                        <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                        <YAxis type="category" dataKey="setup_type" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="total_pnl" radius={4}>
                          {setups.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.total_pnl >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <p className="text-muted-foreground">Tag trades with setup types to see analytics</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Losses Tab */}
          <TabsContent value="losses" className="space-y-4">
            {/* Pattern Detection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Worst Time</CardDescription>
                  <CardTitle className="text-xl text-red-600">
                    {lossesData?.patterns.worstHour
                      ? `${lossesData.patterns.worstHour.hour}:00`
                      : 'N/A'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {lossesData?.patterns.worstHour
                      ? `$${lossesData.patterns.worstHour.total_loss.toFixed(2)} total losses`
                      : 'No time data available'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Worst Day</CardDescription>
                  <CardTitle className="text-xl text-red-600">
                    {lossesData?.patterns.worstDay?.day_of_week || 'N/A'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {lossesData?.patterns.worstDay
                      ? `$${lossesData.patterns.worstDay.total_loss.toFixed(2)} total losses`
                      : 'No day data available'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Hold Time</CardDescription>
                  <CardTitle className="text-xl">
                    {lossesData?.patterns.holdTime.find(h => h.category === 'losers')?.avg_hold_time || 0} min
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Losers avg vs{' '}
                    {lossesData?.patterns.holdTime.find(h => h.category === 'winners')?.avg_hold_time || 0} min winners
                  </p>
                  {lossesData?.patterns.holdTime &&
                   (lossesData.patterns.holdTime.find(h => h.category === 'losers')?.avg_hold_time || 0) >
                   (lossesData.patterns.holdTime.find(h => h.category === 'winners')?.avg_hold_time || 0) && (
                    <Badge variant="destructive" className="mt-2">Holding losers too long</Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Biggest Losers Table */}
            <Card>
              <CardHeader>
                <CardTitle>Biggest Losers</CardTitle>
                <CardDescription>Your worst trades - find the patterns</CardDescription>
              </CardHeader>
              <CardContent>
                {lossesData && lossesData.losses.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Entry Time</TableHead>
                        <TableHead>Hold Time</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead className="text-right">P/L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lossesData.losses.map((loss) => (
                        <TableRow key={loss.id}>
                          <TableCell>{loss.date}</TableCell>
                          <TableCell className="font-medium">{loss.underlying}</TableCell>
                          <TableCell>{loss.entry_time || '—'}</TableCell>
                          <TableCell>
                            {loss.hold_time_minutes ? `${loss.hold_time_minutes} min` : '—'}
                          </TableCell>
                          <TableCell>{loss.day_of_week}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            ${loss.net_pnl.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No losing trades found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Time Tab */}
          <TabsContent value="time" className="space-y-4">
            {/* Insight Banner */}
            {timeData?.insight && (
              <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                  <p className="text-amber-800 dark:text-amber-200">
                    If you stopped trading at {timeData.insight.hour}:00, you'd be{' '}
                    <strong>${timeData.insight.savedAmount.toFixed(2)}</strong> more profitable.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Session Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['open', 'midday', 'close'].map((sessionName) => {
                const session = timeData?.sessions.find(s => s.session === sessionName);
                const isProfit = session && session.total_pnl > 0;
                const isLoss = session && session.total_pnl < 0;
                return (
                  <Card key={sessionName}>
                    <CardHeader className="pb-2">
                      <CardDescription className="flex items-center gap-2">
                        {sessionName === 'open' && '🌅'}
                        {sessionName === 'midday' && '🌤️'}
                        {sessionName === 'close' && '🌆'}
                        {sessionName.charAt(0).toUpperCase() + sessionName.slice(1)}
                        <span className="text-xs text-muted-foreground">
                          {sessionName === 'open' && '(9:30-11:00)'}
                          {sessionName === 'midday' && '(11:00-2:00)'}
                          {sessionName === 'close' && '(2:00-4:00)'}
                        </span>
                      </CardDescription>
                      <CardTitle className={`text-2xl ${isProfit ? 'text-green-600' : isLoss ? 'text-red-600' : ''}`}>
                        ${session?.total_pnl.toFixed(2) || '0.00'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Win Rate: {session?.win_rate || 0}%</p>
                        <p>Trades: {session?.trade_count || 0}</p>
                      </div>
                      {isProfit && <Badge className="mt-2 bg-green-600">Your edge</Badge>}
                      {isLoss && <Badge variant="destructive" className="mt-2">Stop trading</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Hourly P/L Chart */}
            <Card>
              <CardHeader>
                <CardTitle>P/L by Hour</CardTitle>
                <CardDescription>When are you making and losing money?</CardDescription>
              </CardHeader>
              <CardContent>
                {timeData && timeData.hourly.length > 0 ? (
                  <ChartContainer config={hourlyChartConfig} className="h-[300px] w-full">
                    <BarChart data={timeData.hourly} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total_pnl" radius={4}>
                        {timeData.hourly.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.total_pnl >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No hourly data available. Trades need entry_time to analyze.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Symbols Tab */}
          <TabsContent value="symbols" className="space-y-4">
            {/* Recommendation Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Best Symbol</CardDescription>
                  <CardTitle className="text-xl text-green-600">
                    {symbolData?.insights.bestSymbol?.underlying || 'N/A'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {symbolData?.insights.bestSymbol && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>${symbolData.insights.bestSymbol.total_pnl.toFixed(2)} total</p>
                      <p>{symbolData.insights.bestSymbol.trade_count} trades</p>
                      <p>{symbolData.insights.bestSymbol.win_rate}% win rate</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Worst Symbol</CardDescription>
                  <CardTitle className="text-xl text-red-600">
                    {symbolData?.insights.worstSymbol?.underlying || 'N/A'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {symbolData?.insights.worstSymbol && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>${symbolData.insights.worstSymbol.total_pnl.toFixed(2)} total</p>
                      <p>{symbolData.insights.worstSymbol.trade_count} trades</p>
                      <p>{symbolData.insights.worstSymbol.win_rate}% win rate</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Recommendation</CardDescription>
                  <CardTitle className="text-lg">
                    Focus: {symbolData?.insights.focusOn.join(', ') || 'N/A'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Avoid: {symbolData?.insights.avoid.join(', ') || 'N/A'}
                  </p>
                  <Separator className="my-2" />
                  <p className="text-sm">
                    <span className="text-green-600">
                      +${symbolData?.insights.profitableTotal.toFixed(2) || '0'}
                    </span>
                    {' vs '}
                    <span className="text-red-600">
                      ${symbolData?.insights.unprofitableTotal.toFixed(2) || '0'}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Symbol P/L Chart */}
            <Card>
              <CardHeader>
                <CardTitle>P/L by Symbol</CardTitle>
                <CardDescription>Which underlyings are you profitable on?</CardDescription>
              </CardHeader>
              <CardContent>
                {symbolData && symbolData.symbols.length > 0 ? (
                  <ChartContainer config={symbolChartConfig} className="h-[300px] w-full">
                    <BarChart
                      data={symbolData.symbols}
                      layout="horizontal"
                      margin={{ top: 10, right: 30, left: 60, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="underlying" />
                      <YAxis tickFormatter={(v) => `$${v}`} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total_pnl" radius={4}>
                        {symbolData.symbols.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.total_pnl >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No symbol data available</p>
                )}
              </CardContent>
            </Card>

            {/* Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Performance by Symbol</CardTitle>
                <CardDescription>Detailed breakdown by underlying</CardDescription>
              </CardHeader>
              <CardContent>
                {symbolData && symbolData.symbols.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead className="text-right">Trades</TableHead>
                        <TableHead className="text-right">Winners</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">Total P/L</TableHead>
                        <TableHead className="text-right">Avg P/L</TableHead>
                        <TableHead className="text-right">Best</TableHead>
                        <TableHead className="text-right">Worst</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {symbolData.symbols.map((symbol) => (
                        <TableRow key={symbol.underlying}>
                          <TableCell className="font-medium">{symbol.underlying}</TableCell>
                          <TableCell className="text-right">{symbol.trade_count}</TableCell>
                          <TableCell className="text-right">{symbol.winners}</TableCell>
                          <TableCell className="text-right">{symbol.win_rate}%</TableCell>
                          <TableCell className={`text-right font-medium ${symbol.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${symbol.total_pnl.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right ${symbol.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${symbol.avg_pnl.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            ${symbol.largest_win.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            ${symbol.largest_loss.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No symbol data available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trades Tab */}
          <TabsContent value="trades">
            <Card>
              <CardHeader>
                <CardTitle>Recent Trades</CardTitle>
                <CardDescription>Last 100 trades</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead>Exit</TableHead>
                      <TableHead>P/L</TableHead>
                      <TableHead>Setup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell>{trade.date}</TableCell>
                        <TableCell className="font-mono">
                          ${trade.strike} {trade.option_type}
                        </TableCell>
                        <TableCell>{trade.quantity}</TableCell>
                        <TableCell>${trade.entry_price.toFixed(2)}</TableCell>
                        <TableCell>${trade.exit_price.toFixed(2)}</TableCell>
                        <TableCell className={trade.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                          ${trade.net_pnl.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {trade.setup_type ? (
                            <Badge variant="outline">{trade.setup_type}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Setups Tab */}
          <TabsContent value="setups">
            <Card>
              <CardHeader>
                <CardTitle>Performance by Setup</CardTitle>
                <CardDescription>Which setups are working for you?</CardDescription>
              </CardHeader>
              <CardContent>
                {setups.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Setup Type</TableHead>
                        <TableHead className="text-right">Trades</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">Total P/L</TableHead>
                        <TableHead className="text-right">Avg P/L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {setups.map((setup) => (
                        <TableRow key={setup.setup_type}>
                          <TableCell className="font-medium">{setup.setup_type}</TableCell>
                          <TableCell className="text-right">{setup.trade_count}</TableCell>
                          <TableCell className="text-right">{setup.win_rate}%</TableCell>
                          <TableCell className={`text-right ${setup.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${setup.total_pnl.toFixed(2)}
                          </TableCell>
                          <TableCell className={`text-right ${setup.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${setup.avg_pnl.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No setup data yet.</p>
                    <p className="text-sm mt-2">Tag your trades using the CLI:</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                      python src/journal.py setup &lt;trade_id&gt; &lt;setup_type&gt;
                    </code>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar">
            <Card>
              <CardHeader>
                <CardTitle>Daily Performance</CardTitle>
                <CardDescription>P/L by day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {summaries.slice(0, 30).reverse().map((day) => (
                    <div
                      key={day.date}
                      className={`p-3 rounded-lg text-center ${
                        day.net_pnl >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                      }`}
                    >
                      <div className="text-xs text-muted-foreground">{day.date.slice(5)}</div>
                      <div className={`font-bold ${day.net_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${day.net_pnl.toFixed(0)}
                      </div>
                      <div className="text-xs">{day.winners}W/{day.losers}L</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
