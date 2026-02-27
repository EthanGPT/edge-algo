import { useState, useEffect, useMemo } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, isToday, isSameMonth, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, AlertTriangle, TrendingUp, RefreshCw, Filter, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { HIGH_IMPACT_RELEASES, EventImpact } from '@/types';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_R2_API_URL || 'https://proptracker-api.ethhartwell.workers.dev';

// FRED Release IDs mapped to our event keys
const FRED_RELEASE_MAP: Record<number, string> = {
  50: 'nfp',       // Employment Situation
  10: 'cpi',       // Consumer Price Index
  46: 'ppi',       // Producer Price Index
  53: 'gdp',       // Gross Domestic Product
  54: 'pce',       // Personal Income and Outlays (includes Core PCE)
  9: 'retail',     // Advance Monthly Sales for Retail
  95: 'durable',   // Manufacturer's Shipments, Inventories, and Orders (M3)
  180: 'claims',   // Unemployment Insurance Weekly Claims
  194: 'adp',      // ADP National Employment Report
};

interface EconomicEvent {
  id: string;
  releaseId: string;
  name: string;
  date: string;
  time: string; // ET time
  impact: EventImpact;
  affectsInstruments: string[];
  forecast?: string;
  previous?: string;
}

const CACHE_KEY = 'proptracker_economic_events_cache_v8'; // Bumped to clear bad cache
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

function getCachedEvents(): { events: EconomicEvent[]; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

function setCachedEvents(events: EconomicEvent[]): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ events, timestamp: Date.now() }));
}

// Fetch scheduled releases from FRED API for each specific release we care about
async function fetchAllReleases(): Promise<EconomicEvent[]> {
  if (!API_URL) {
    console.error('[EconCal] API_URL not configured');
    return [];
  }

  const today = new Date();
  const startDate = format(subMonths(today, 1), 'yyyy-MM-dd');
  const endDate = format(addMonths(today, 3), 'yyyy-MM-dd');

  const releaseMap = new Map(HIGH_IMPACT_RELEASES.map(r => [r.id, r]));
  const events: EconomicEvent[] = [];

  // Fetch each release ID individually to avoid the 1000 limit issue
  const releaseIds = Object.entries(FRED_RELEASE_MAP);
  console.log('[EconCal] Fetching', releaseIds.length, 'release types from', startDate, 'to', endDate);

  const fetchPromises = releaseIds.map(async ([releaseId, key]) => {
    const url = `${API_URL}/fred/release/${releaseId}?start=${startDate}&end=${endDate}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[EconCal] Failed to fetch release ${releaseId}:`, response.status);
        return [];
      }
      const data = await response.json();
      const dates = data.release_dates || [];

      const releaseInfo = releaseMap.get(key);
      if (!releaseInfo) return [];

      return dates.map((rel: { date: string }) => ({
        id: `${key}-${rel.date}`,
        releaseId: key,
        name: releaseInfo.name,
        date: rel.date,
        time: releaseInfo.time,
        impact: releaseInfo.impact,
        affectsInstruments: [...releaseInfo.affects],
      }));
    } catch (error) {
      console.error(`[EconCal] Error fetching release ${releaseId}:`, error);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(releaseEvents => events.push(...releaseEvents));

  console.log('[EconCal] Total events fetched:', events.length);

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });
}

const impactConfig = {
  high: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500' },
  medium: { color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
  low: { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', dot: 'bg-blue-500' },
};

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period} ET`;
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterInstruments, setFilterInstruments] = useState<string[]>(['MNQ', 'GC']);
  const [filterImpact, setFilterImpact] = useState<EventImpact[]>(['high', 'medium']);

  const loadEvents = async (forceRefresh = false) => {
    console.log('[EconCal] loadEvents called, forceRefresh:', forceRefresh);
    setLoading(true);
    setError(null);

    if (!forceRefresh) {
      const cached = getCachedEvents();
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('[EconCal] Using cached events:', cached.events.length);
        setEvents(cached.events);
        setLoading(false);
        return;
      }
    }

    try {
      console.log('[EconCal] Fetching fresh data...');
      const fetchedEvents = await fetchAllReleases();
      console.log('[EconCal] Fetched events:', fetchedEvents.length);
      setEvents(fetchedEvents);
      setCachedEvents(fetchedEvents);
    } catch (err) {
      setError('Failed to load economic events from FRED API.');
      console.error('[EconCal] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesInstrument = event.affectsInstruments.some(i => filterInstruments.includes(i));
      const matchesImpact = filterImpact.includes(event.impact);
      return matchesInstrument && matchesImpact;
    });
  }, [events, filterInstruments, filterImpact]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    filteredEvents.forEach(event => {
      const existing = map.get(event.date) || [];
      map.set(event.date, [...existing, event]);
    });
    return map;
  }, [filteredEvents]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return eventsByDate.get(dateStr) || [];
  }, [selectedDate, eventsByDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const twoWeeksFromNow = new Date(now);
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
    const twoWeeksLater = format(twoWeeksFromNow, 'yyyy-MM-dd');
    return filteredEvents
      .filter(e => e.date >= today && e.date <= twoWeeksLater)
      .slice(0, 20);
  }, [filteredEvents]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const startDay = start.getDay();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push(new Date(start.getTime() - (i + 1) * 24 * 60 * 60 * 1000));
    }

    let current = new Date(start);
    while (current <= end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(end.getTime() + i * 24 * 60 * 60 * 1000));
    }

    return days;
  }, [currentMonth]);

  const toggleInstrument = (instrument: string) => {
    setFilterInstruments(prev =>
      prev.includes(instrument) ? prev.filter(i => i !== instrument) : [...prev, instrument]
    );
  };

  const toggleImpact = (impact: EventImpact) => {
    setFilterImpact(prev =>
      prev.includes(impact) ? prev.filter(i => i !== impact) : [...prev, impact]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Economic Calendar</h1>
          <p className="page-subtitle">High-impact US events for MNQ & Gold</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Instruments</p>
                  <div className="space-y-2">
                    {['MNQ', 'GC'].map(instrument => (
                      <div key={instrument} className="flex items-center space-x-2">
                        <Checkbox
                          id={`inst-${instrument}`}
                          checked={filterInstruments.includes(instrument)}
                          onCheckedChange={() => toggleInstrument(instrument)}
                        />
                        <Label htmlFor={`inst-${instrument}`} className="text-sm">
                          {instrument === 'MNQ' ? 'MNQ (Nasdaq)' : 'GC (Gold)'}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Impact</p>
                  <div className="space-y-2">
                    {(['high', 'medium'] as EventImpact[]).map(impact => (
                      <div key={impact} className="flex items-center space-x-2">
                        <Checkbox
                          id={`impact-${impact}`}
                          checked={filterImpact.includes(impact)}
                          onCheckedChange={() => toggleImpact(impact)}
                        />
                        <Label htmlFor={`impact-${impact}`} className="text-sm flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", impactConfig[impact].dot)} />
                          {impact === 'high' ? 'High' : 'Medium'}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => loadEvents(true)} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-destructive/50 bg-destructive/10">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}

            {calendarDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDate.get(dateStr) || [];
              const hasHighImpact = dayEvents.some(e => e.impact === 'high');
              const hasMediumImpact = dayEvents.some(e => e.impact === 'medium');
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isCurrentMonth = isSameMonth(day, currentMonth);

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "relative p-2 min-h-[60px] text-left rounded-md transition-colors",
                    "hover:bg-muted/50",
                    !isCurrentMonth && "text-muted-foreground/50",
                    isToday(day) && "bg-primary/10 font-bold",
                    isSelected && "ring-2 ring-primary bg-primary/5"
                  )}
                >
                  <span className="text-sm">{format(day, 'd')}</span>
                  {dayEvents.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 flex-wrap">
                      {hasHighImpact && <span className="w-2 h-2 rounded-full bg-red-500" />}
                      {hasMediumImpact && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
                      {dayEvents.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 2}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Date Events */}
          {selectedDate && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium mb-2">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </h3>
              {selectedDateEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events scheduled</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {selectedDateEvents.map(event => (
                    <div
                      key={event.id}
                      className={cn("p-2 rounded-md border text-sm", impactConfig[event.impact].bg, impactConfig[event.impact].border)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{event.name}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(event.time)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {event.affectsInstruments.map(inst => (
                          <Badge key={inst} variant="secondary" className="text-xs h-5">
                            {inst}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Compact Legend */}
          <div className="mt-4 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>High</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>Medium</span>
            </div>
            <span className="text-muted-foreground/60">|</span>
            <span>All times ET</span>
          </div>
        </Card>

        {/* Upcoming Events */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5" />
            Next 2 Weeks
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {upcomingEvents.map(event => {
                const eventDate = parseISO(event.date);
                const isEventToday = isToday(eventDate);

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "p-2 rounded-md border transition-colors cursor-pointer hover:bg-muted/50",
                      impactConfig[event.impact].border,
                      isEventToday && "bg-primary/5 border-primary/30"
                    )}
                    onClick={() => {
                      setSelectedDate(eventDate);
                      setCurrentMonth(eventDate);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", impactConfig[event.impact].dot)} />
                          <p className="font-medium text-sm truncate">{event.name}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className={isEventToday ? "text-primary font-medium" : ""}>
                            {isEventToday ? 'Today' : format(eventDate, 'EEE, MMM d')}
                          </span>
                          <span>•</span>
                          <span>{formatTime(event.time)}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {event.affectsInstruments.map(inst => (
                          <span key={inst} className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                            {inst}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
