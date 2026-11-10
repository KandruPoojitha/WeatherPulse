import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CloudSun, Compass, Droplets, Eye, Gauge, LocateFixed, MapPin, RefreshCw, Search, Wind, CloudRain, Thermometer, CalendarDays, Clock3, Sunrise } from 'lucide-react';
import type { City, WeatherData } from './types';
import { degrees, describeWeather, localClock, localHour, number, weekday, windDirection } from './weather';

const TORONTO: City = { name: 'Toronto', admin1: 'Ontario', country: 'Canada', latitude: 43.6532, longitude: -79.3832, timezone: 'America/Toronto' };
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const TABS = [{ id: 'temperature_c', text: 'Temperature', unit: '°C' }, { id: 'feels_like_c', text: 'Feels like', unit: '°C' }, { id: 'humidity_pct', text: 'Humidity', unit: '%' }, { id: 'wind_speed_kmh', text: 'Wind', unit: 'km/h' }] as const;
type Metric = typeof TABS[number]['id'];

export default function App() {
  const [city, setCity] = useState<City>(TORONTO);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState<Metric>('temperature_c');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const latestRequest = useRef(0);
  const cityRef = useRef(city);
  cityRef.current = city;

  async function getWeather(target: City, silent = false) {
    const request = ++latestRequest.current;
    if (silent) setRefreshing(true); else setBusy(true);
    try {
      const p = new URLSearchParams({ lat: String(target.latitude), lon: String(target.longitude), name: target.name, admin1: target.admin1 || '', country: target.country });
      const response = await fetch(`${API_BASE}/api/weather?${p}`);
      if (!response.ok) throw new Error('The weather service is unavailable right now.');
      const result: WeatherData = await response.json();
      if (request === latestRequest.current) { setWeather(result); setError(''); }
    } catch (e) {
      if (request === latestRequest.current) setError(e instanceof Error ? e.message : 'Unable to load weather');
    } finally {
      if (request === latestRequest.current) { setBusy(false); setRefreshing(false); }
    }
  }

  useEffect(() => { void getWeather(city); const interval = window.setInterval(() => void getWeather(cityRef.current, true), 300_000); return () => window.clearInterval(interval); }, [city]);
  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); setSearchBusy(false); return; }
    let active = true;
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      setSearchBusy(true);
      try { const r = await fetch(`${API_BASE}/api/cities/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }); if (!r.ok) throw new Error('Search failed'); const found: City[] = await r.json(); if (active) setSuggestions(found); }
      catch { if (active) setSuggestions([]); }
      finally { if (active) setSearchBusy(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(handle); controller.abort(); };
  }, [query]);
  useEffect(() => { const onClick = (ev: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(ev.target as Node)) setSearchOpen(false); }; document.addEventListener('mousedown', onClick); return () => document.removeEventListener('mousedown', onClick); }, []);

  function selectCity(next: City) { setCity(next); setQuery(''); setSearchOpen(false); setSuggestions([]); }

  const hours = useMemo(() => {
    if (!weather) return [];
    const currentTime = weather.current.observed_at_local.slice(0, 13);
    return weather.hourly.filter(h => h.forecast_for_local.slice(0, 13) >= currentTime).slice(0, 24);
  }, [weather]);
  const today = weather?.daily[0];
  const current = weather?.current;
  const daily = weather?.daily ?? [];
  const activeMetric = TABS.find(t => t.id === metric)!;
  const low = daily.length ? Math.min(...daily.map(d => d.temp_min_c ?? 1000)) : 0;
  const high = daily.length ? Math.max(...daily.map(d => d.temp_max_c ?? -1000)) : 1;
  const scale = Math.max(1, high - low);
  const HeroIcon = describeWeather(current?.weather_code ?? null, current?.is_day ?? true).Icon;
  const localDate = current ? new Date(`${current.observed_at_local.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';

  return (
    <div className="site">
      <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
      <header className="topnav shell">
        <div className="wordmark"><span className="brand-icon"><CloudSun size={24} strokeWidth={2.3}/></span><span>Weather<span className="brand-blue">Pulse</span><small>YOUR DAILY OUTLOOK</small></span></div>
        <div className="header-right">
          <div className="search-wrapper" ref={searchRef}>
            <Search size={17} className="search-symbol"/>
            <input aria-label="Search city" type="search" placeholder="Search any city..." value={query} onFocus={() => setSearchOpen(true)} onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}/>
            <span className="shortcut">⌕</span>
            {searchOpen && query.trim().length >= 2 && <div className="suggestions">
              <div className="search-heading">{searchBusy ? 'Searching locations…' : suggestions.length ? 'LOCATIONS' : 'No matching cities'}</div>
              {suggestions.map(c => <button key={`${c.id || c.name}-${c.latitude}-${c.longitude}`} onClick={() => selectCity(c)}><MapPin size={16}/><span><strong>{c.name}</strong><small>{[c.admin1,c.country].filter(Boolean).join(', ')}</small></span><ArrowUpRight size={15}/></button>)}
            </div>}
          </div>
          <button className="icon-button refresh-btn" title="Refresh weather" aria-label="Refresh weather" onClick={() => void getWeather(city, true)} disabled={refreshing}><RefreshCw size={18} className={refreshing ? 'spinning' : ''}/></button>
        </div>
      </header>
      <main className="shell page-content">
        {error && <div className="error-banner" role="alert"><span>{error} {weather ? 'Showing the last available forecast.' : 'Check that your backend is running.'}</span><button onClick={() => void getWeather(city)}><RefreshCw size={16}/> Retry</button></div>}
        {busy && !weather ? <div className="loading-screen"><CloudSun size={48}/><h2>Finding your forecast…</h2><p>Connecting to the weather service</p></div> : !weather ? <div className="loading-screen"><CloudSun size={48}/><h2>Weather isn’t available</h2><p>Start FastAPI on port 8000, then press Refresh above.</p></div> : weather && current ? <>
          <div className="overline"><div><span className="pulse-dot"/> LIVE FORECAST <span className="overline-sep">/</span> {localDate}</div><span>Updated {localClock(current.observed_at_local)} local time</span></div>
          <section className="hero">
            <div className="hero-details">
              <div className="location-tag"><MapPin size={16}/><span>{[weather.city.name, weather.city.admin1].filter(Boolean).join(', ')}</span><span className="country-chip">{weather.city.country}</span></div>
              <div className="hero-temp">{degrees(current.temperature_c)}<span className="hero-unit">C</span></div>
              <h1>{describeWeather(current.weather_code, current.is_day ?? true).label}</h1>
              <p className="hero-feels">Feels like {degrees(current.feels_like_c)} · A moment to check the skies.</p>
              <div className="hero-bottom"><span><strong>H:</strong> {degrees(today?.temp_max_c)}</span><span className="hero-divider"/><span><strong>L:</strong> {degrees(today?.temp_min_c)}</span></div>
            </div>
            <div className="hero-scene" aria-hidden="true"><div className="sun-aura"/><div className="sun-orb"/><HeroIcon className="hero-weather-icon" size={184} strokeWidth={1.15}/><div className="hill hill-back"/><div className="hill hill-front"/><div className="scene-spark s1"/><div className="scene-spark s2"/></div>
            <span className="hero-watermark">WEATHERPULSE / FORECAST</span>
          </section>
          <div className="dashboard-grid">
            <section className="glass-card forecast-card span-2"><div className="card-header"><h2><Clock3 size={18}/> Hourly forecast</h2><span>Next 24 hours <ArrowUpRight size={15}/></span></div>
              <div className="hourly-scroll">{hours.map((h,i) => { const Icon = describeWeather(h.weather_code).Icon; return <div key={h.forecast_for_local} className={`hour-tile ${i === 0 ? 'active-hour' : ''}`}><span>{i === 0 ? 'Now' : localHour(h.forecast_for_local)}</span><Icon size={30} strokeWidth={1.75} className="hour-icon"/><strong>{degrees(h.temperature_c)}</strong><small><Droplets size={11}/>{number(h.precip_probability_pct,'%')}</small></div>; })}</div>
            </section>
            <section className="glass-card trend-card span-2"><div className="card-header trend-head"><h2><Thermometer size={18}/> Weather trends</h2><div className="metric-tabs">{TABS.map(t => <button key={t.id} className={metric === t.id ? 'selected' : ''} onClick={() => setMetric(t.id)}>{t.text}</button>)}</div></div>
              <div className="trend-sub">{activeMetric.text} over the next 24 hours</div>
              <div className="chart-container"><ResponsiveContainer width="100%" height="100%"><AreaChart data={hours} margin={{ top: 18, right: 8, left: -17, bottom: 0 }}><defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#64c8ff" stopOpacity=".35"/><stop offset="100%" stopColor="#64c8ff" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="rgba(207,227,250,.09)" vertical={false}/><XAxis dataKey="forecast_for_local" tickFormatter={localHour} tickLine={false} axisLine={false} interval={4} tick={{ fill: '#91aec9', fontSize: 11 }} dy={12}/><YAxis axisLine={false} tickLine={false} tick={{ fill: '#91aec9', fontSize: 11 }} width={42}/><Tooltip labelFormatter={v => String(v).replace('T',' ')} formatter={v => [`${v} ${activeMetric.unit}`, activeMetric.text]} contentStyle={{ background: '#122c49', color: '#fff', border: '1px solid #38536b', borderRadius: 14 }} /><Area type="monotone" dataKey={metric} stroke="#78d2ff" strokeWidth={3} fill="url(#trend-fill)" activeDot={{r:5,fill:'#e0f6ff'}} connectNulls /></AreaChart></ResponsiveContainer></div>
            </section>
            <section className="glass-card seven-day"><div className="card-header"><h2><CalendarDays size={18}/> 7-day forecast</h2><span>°C</span></div><div className="day-list">{daily.map((d,i)=> { const Icon = describeWeather(d.weather_code).Icon; const start = Math.max(0, ((d.temp_min_c ?? low) - low) / scale * 100); const width = Math.max(3, ((d.temp_max_c ?? low) - (d.temp_min_c ?? low)) / scale * 100); return <div className="day-row" key={d.forecast_date}><b>{i === 0 ? 'Today' : weekday(d.forecast_date)}</b><Icon size={21} className="day-icon"/><span className="low-val">{degrees(d.temp_min_c)}</span><div className="temp-bar"><div className="range" style={{left:`${start}%`, width:`${width}%`}}/></div><strong>{degrees(d.temp_max_c)}</strong></div>; })}</div></section>
            <section className="highlights"><div className="mini-heading">TODAY'S HIGHLIGHTS <span>Conditions at a glance</span></div><div className="details-grid">
              <Detail label="Humidity" value={number(current.humidity_pct,'%')} subtitle="Relative humidity" Icon={Droplets}/>
              <Detail label="Wind" value={number(current.wind_speed_kmh,' km/h')} subtitle={`Direction ${windDirection(current.wind_direction_degrees)}`} Icon={Wind}/>
              <Detail label="UV index" value={number(today?.uv_index_max)} subtitle="Daily maximum" Icon={CloudSun}/>
              <Detail label="Precipitation" value={number(today?.precip_prob_pct,'%')} subtitle="Today's peak chance" Icon={CloudRain}/>
              <Detail label="Visibility" value={hours[0]?.visibility_m == null ? '—' : `${(hours[0].visibility_m / 1000).toFixed(1)} km`} subtitle="Nearest forecast hour" Icon={Eye}/>
              <Detail label="Pressure" value={number(current.pressure_hpa,' hPa')} subtitle="Sea-level pressure" Icon={Gauge}/>
            </div></section>
            <section className="glass-card sunrise-card"><div className="card-header"><h2><Sunrise size={18}/> Sun & daylight</h2><span>Local time</span></div><div className="sun-times"><div><span>Sunrise</span><strong>{today?.sunrise_local ? localClock(today.sunrise_local) : '—'}</strong></div><div className="sun-arc"><span className="sun-arc-line"/><span className="sun-arc-orb"/></div><div><span>Sunset</span><strong>{today?.sunset_local ? localClock(today.sunset_local) : '—'}</strong></div></div></section>
            <section className="glass-card insight-card"><div className="card-header"><h2><Compass size={18}/> Your forecast, simplified</h2></div><p>{describeWeather(current.weather_code, current.is_day ?? true).label} in {weather.city.name} right now, with temperatures around <strong>{degrees(current.temperature_c)}</strong>. Expect a high of <strong>{degrees(today?.temp_max_c)}</strong> and a low of <strong>{degrees(today?.temp_min_c)}</strong> today.</p><span>Forecast data refreshes while this page is open.</span></section>
          </div>
        </> : null}
      </main>
      <footer className="shell footer"><span><CloudSun size={18}/> Weather<span>Pulse</span></span><p>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Forecasts are estimates, not official alerts.</p><span>Made for curious skies <LocateFixed size={14}/></span></footer>
    </div>
  );
}

function Detail({ label, value, subtitle, Icon }: { label: string; value: string; subtitle: string; Icon: typeof Droplets }) {
  return <article className="detail-tile"><div className="detail-top"><span>{label.toUpperCase()}</span><Icon size={19}/></div><strong>{value}</strong><small>{subtitle}</small></article>;
}
