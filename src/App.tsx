/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  User, 
  TrendingUp, 
  RefreshCw, 
  ExternalLink, 
  ShieldCheck, 
  ShieldAlert, 
  LayoutDashboard,
  LogOut,
  Calculator,
  ChevronRight,
  Package,
  ArrowRightLeft,
  Coins,
  AlertCircle,
  Plus,
  X,
  ChevronDown,
  Info,
  SlidersHorizontal,
  Filter,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MarketplaceData, TornProfile, EnrichedSeller, MarketplaceListing, SelectedItem } from './types';

// Constants
const REFRESH_INTERVAL = 30000; // 30 seconds
const TORN_API_BASE = 'https://api.torn.com';
const MARKETPLACE_API_BASE = 'https://weav3r.dev/api/marketplace';

const ITEMS_DATABASE = [
  { id: '364', name: 'Xanax', category: 'Drug' },
  { id: '370', name: 'E-DVD', category: 'Special' },
  { id: '187', name: 'Nessie', category: 'Plushie' },
  { id: '260', name: 'Peony', category: 'Flower' },
  { id: '1059', name: 'Small Arms', category: 'Cache' },
  { id: '366', name: 'Vicodin', category: 'Drug' },
  { id: '367', name: 'LSD', category: 'Drug' },
  { id: '215', name: 'Donator Pack', category: 'Special' },
  { id: '368', name: 'Ecstasy', category: 'Drug' },
  { id: '365', name: 'Speed', category: 'Drug' },
];

const SUGGESTIONS = ITEMS_DATABASE.slice(0, 6);

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('shadow_bazaar_key') || '');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState<TornProfile | null>(null);
  const [allItems, setAllItems] = useState<SelectedItem[]>([]);
  
  // Multi-item state
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>(() => {
    const saved = localStorage.getItem('shadow_bazaar_selected');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeItemId, setActiveItemId] = useState<string>('');
  
  const [itemIdInput, setItemIdInput] = useState<string>('');
  const [marketData, setMarketData] = useState<MarketplaceData | null>(null);
  const [sellerDetails, setSellerDetails] = useState<Record<number, EnrichedSeller>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [listingsToShow, setListingsToShow] = useState<number>(5);
  const [isSyncingSellers, setIsSyncingSellers] = useState<boolean>(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem('shadow_refresh_interval');
    return saved ? parseInt(saved) : 30; // default 30s
  });
  const [secondsLeft, setSecondsLeft] = useState<number>(autoRefreshInterval);

  // Alert State
  const [alertPrices, setAlertPrices] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('shadow_alert_prices');
    return saved ? JSON.parse(saved) : {};
  });
  const [triggeredAlerts, setTriggeredAlerts] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [alertsToShowCount, setAlertsToShowCount] = useState<number>(2);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const [buyPrice, setBuyPrice] = useState<string>('');
  const [sellPrice, setSellPrice] = useState<string>('');
  
  // Filter state
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [filters, setFilters] = useState({
    minLevel: 0,
    maxLevel: 100,
    minAge: 0,
    maxAge: 10000,
    statuses: [] as string[]
  });

  const resetFilters = () => {
    setFilters({
      minLevel: 0,
      maxLevel: 100,
      minAge: 0,
      maxAge: 10000,
      statuses: [] as string[]
    });
  };

  // Audio initialization
  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.loop = true;
  }, []);

  useEffect(() => {
    localStorage.setItem('shadow_alert_prices', JSON.stringify(alertPrices));
  }, [alertPrices]);

  const playAlert = () => {
    if (!isMuted && audioRef.current) {
      audioRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  };

  const stopAlert = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  // Fuzzy Search results
  const getFuzzyResults = (query: string) => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const source = allItems.length > 0 ? allItems : ITEMS_DATABASE;
    return source.filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.id.includes(q)
    ).slice(0, 8);
  };

  const fuzzyResults = getFuzzyResults(itemIdInput);

  // Background check for all selected items
  const backgroundCheck = async () => {
    if (!isLoggedIn) return;
    for (const item of selectedItems) {
      try {
        const response = await fetch(`${MARKETPLACE_API_BASE}/${item.id}?ts=${Date.now()}`);
        const data: MarketplaceData = await response.json();
        const lowest = data.listings[0]?.price || 0;
        const target = parseFloat(alertPrices[item.id] || '0');
        
        if (target > 0 && lowest <= target) {
          // If alerted, also update seller profiles for that item
          const topSellers = data.listings.slice(0, 3).map(l => l.player_id);
          topSellers.map(sid => fetchSellerProfile(sid, true));

          setTriggeredAlerts(prev => {
            if (!prev.includes(item.id)) {
              playAlert();
              return [item.id, ...prev];
            }
            return prev;
          });
        }
      } catch (e) {
        console.error(`Alert check failed for ${item.id}`, e);
      }
      // Small delay to prevent burst
      await new Promise(r => setTimeout(r, 600));
    }
  };

  // Auto-refresh timer - Independent of active item selection to prevent reset on tab change
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let countdown: NodeJS.Timeout;

    if (isLoggedIn && autoRefreshInterval > 0) {
      // Sync initial state if not already running
      if (secondsLeft === 0) setSecondsLeft(autoRefreshInterval);
      
      timer = setInterval(() => {
        // Refresh active view AND background checks
        if (activeItemId) {
          fetchMarketData(activeItemId, true).then(() => {
            backgroundCheck();
            setSecondsLeft(autoRefreshInterval);
          });
        } else {
          backgroundCheck();
          setSecondsLeft(autoRefreshInterval);
        }
      }, autoRefreshInterval * 1000);

      countdown = setInterval(() => {
        setSecondsLeft(prev => prev > 0 ? prev - 1 : 0);
      }, 1000);
    }
    
    return () => {
      clearInterval(timer);
      clearInterval(countdown);
    };
  }, [isLoggedIn, autoRefreshInterval, selectedItems, alertPrices]); // removed activeItemId from deps to preserve timer

  const fetchAllItems = async (key: string) => {
    try {
      const response = await fetch(`${TORN_API_BASE}/torn/?selections=items&key=${key}`);
      const data = await response.json();
      if (data.items) {
        const formatted = Object.entries(data.items).map(([id, item]: [string, any]) => ({
          id,
          name: item.name,
          category: item.type
        }));
        setAllItems(formatted);
      }
    } catch (e) {
      console.error("Failed to fetch all items", e);
    }
  };

  // Login check on mount
  useEffect(() => {
    if (apiKey) {
      handleLogin(apiKey);
    }
  }, []);

  // Sync selected items to storage
  useEffect(() => {
    localStorage.setItem('shadow_bazaar_selected', JSON.stringify(selectedItems));
    if (selectedItems.length > 0 && !activeItemId) {
      setActiveItemId(selectedItems[0].id);
    }
  }, [selectedItems, activeItemId]);

  // Fetch when active item changes
  useEffect(() => {
    if (activeItemId && isLoggedIn) {
      fetchMarketData(activeItemId);
      setListingsToShow(5);
    }
  }, [activeItemId, isLoggedIn]);

  const handleLogin = async (key: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${TORN_API_BASE}/user/?selections=profile&key=${key}`);
      const data = await response.json();

      if (data.error) {
        if (data.error.code === 2) setError('Invalid API Key provided.');
        else if (data.error.code === 13) setError('Access Level Too Low.');
        else setError(data.error.error || 'Auth failed.');
        setIsLoggedIn(false);
      } else {
        setUserProfile(data);
        setIsLoggedIn(true);
        setApiKey(key);
        localStorage.setItem('shadow_bazaar_key', key);
        fetchAllItems(key);
      }
    } catch (err) {
      setError('Network error during authentication.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserProfile(null);
    setApiKey('');
    localStorage.removeItem('shadow_bazaar_key');
    setMarketData(null);
    setSelectedItems([]);
    setActiveItemId('');
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const fetchSellerProfile = async (sellerId: number, force = false) => {
    if (sellerDetails[sellerId] && !force) return;
    try {
      const resp = await fetch(`${TORN_API_BASE}/user/${sellerId}?selections=profile&key=${apiKey}&ts=${Math.floor(Date.now() / 10000)}`);
      const data = await resp.json();
      if (!data.error) {
        setSellerDetails(prev => ({ ...prev, [sellerId]: { ...data, seller_id: sellerId } }));
      }
    } catch (e) {
      // Silently handle transient network errors to avoid console noise
    }
  };

  const syncSellersBatch = async (ids: number[]) => {
    if (!ids.length || !isLoggedIn || !apiKey) return;
    setIsSyncingSellers(true);
    // Batch requests to be friendly to Torn API
    for (let i = 0; i < ids.length; i += 2) {
      const batch = ids.slice(i, i + 2);
      await Promise.all(batch.map(sid => fetchSellerProfile(sid)));
      if (i + 2 < ids.length) await sleep(150); // Small gap between batches
    }
    setIsSyncingSellers(false);
  };

  const fetchMarketData = async (id: string, isAuto = false) => {
    if (!id) return;
    if (!isAuto) setIsLoading(true);
    else setIsRefreshing(true);
    
    setError(null);
    if (!isAuto) setItemIdInput(''); 
    try {
      const response = await fetch(`${MARKETPLACE_API_BASE}/${id}?ts=${Math.floor(Date.now() / 60000)}`);
      if (!response.ok) throw new Error('Item ID invalid.');
      const data: MarketplaceData = await response.json();
      
      data.listings.sort((a, b) => a.price - b.price);
      setMarketData(data);
      setLastSyncTime(new Date().toLocaleTimeString());
      
      // Initial sync of the visible chunk
      const initialIds = data.listings.slice(0, 10).map(l => l.player_id);
      syncSellersBatch(initialIds);

      if (!selectedItems.find(i => i.id === id)) {
        const itemInfo = allItems.find(it => it.id === id) || ITEMS_DATABASE.find(it => it.id === id);
        setSelectedItems(prev => [...prev, { id, name: data.item_name || itemInfo?.name || `Item ${id}` }].slice(-10));
      }
      return data;
    } catch (err) {
      setError('Market fetch failed.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Robust Seller Intel Syncing
  useEffect(() => {
    if (marketData && isLoggedIn) {
      const visibleListings = marketData.listings
        .filter(listing => {
          const seller = sellerDetails[listing.player_id];
          if (!seller) return true; 
          
          const matchesLevel = seller.level >= filters.minLevel && seller.level <= filters.maxLevel;
          const matchesAge = seller.age >= filters.minAge && seller.age <= filters.maxAge;
          
          if (filters.statuses.length === 0) return matchesLevel && matchesAge;
          
          const statusGroups = [
            { name: 'connectivity', items: ['Online', 'Offline'] },
            { name: 'location', items: ['In Torn', 'Travel', 'Abroad'] },
            { name: 'health', items: ['Okay', 'Hospital'] }
          ];

          return statusGroups.every(group => {
            const selectedInGroup = filters.statuses.filter(s => group.items.includes(s));
            if (selectedInGroup.length === 0) return true;
            return selectedInGroup.some(s => {
              if (s === 'Okay') return getSimpleStatus(seller.status) !== 'Hospital';
              if (s === 'Online') return seller.last_action.status === 'Online';
              if (s === 'Offline') return seller.last_action.status === 'Offline';
              if (s === 'In Torn') {
                const sStatus = getSimpleStatus(seller.status);
                return sStatus !== 'Travel' && sStatus !== 'Abroad';
              }
              return getSimpleStatus(seller.status) === s;
            });
          });
        })
        .slice(0, listingsToShow + 5); 

      const targetSellers = visibleListings
        .map(l => l.player_id)
        .filter(id => !sellerDetails[id]); // Only sync what we don't have
      
      if (targetSellers.length > 0) {
        syncSellersBatch(targetSellers);
      }
    }
  }, [listingsToShow, marketData, isLoggedIn, filters]);

  const toggleItem = (item: SelectedItem) => {
    if (selectedItems.find(i => i.id === item.id)) {
      setSelectedItems(prev => prev.filter(i => i.id !== item.id));
      if (activeItemId === item.id) {
        setActiveItemId(selectedItems.find(i => i.id !== item.id)?.id || '');
      }
    } else {
      setSelectedItems(prev => [...prev, item]);
      setActiveItemId(item.id);
    }
  };

  const formatDisplayValue = (val: string) => {
    if (!val) return '';
    const clean = val.toString().replace(/,/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return val;
    const parts = clean.split('.');
    const formatted = parseInt(parts[0]).toLocaleString('en-US');
    return parts.length > 1 ? `${formatted}.${parts[1].slice(0, 2)}` : formatted;
  };

  const parseNumericInput = (val: string) => {
    let clean = val.replace(/,/g, '').replace(/\s/g, '').toLowerCase();
    
    if (clean.endsWith('k') || clean.endsWith('m') || clean.endsWith('b')) {
      const char = clean.slice(-1);
      const multiplier = char === 'k' ? 1000 : char === 'm' ? 1000000 : 1000000000;
      const num = parseFloat(clean.slice(0, -1));
      return isNaN(num) ? '' : Math.floor(num * multiplier).toString();
    }
    
    const numeric = clean.replace(/[^0-9.]/g, '');
    const parts = numeric.split('.');
    if (parts.length > 2) return `${parts[0]}.${parts[1]}`;
    return numeric;
  };

  const calculateProfit = () => {
    const buy = parseFloat(buyPrice) || 0;
    const sell = parseFloat(sellPrice) || 0;
    return buy > 0 && sell > 0 ? sell - buy : 0;
  };

  const getAgeColor = (age: number) => {
    if (age < 300) return 'text-green-500';
    if (age < 1000) return 'text-yellow-400';
    if (age > 2000) return 'text-red-500';
    return 'text-white font-bold';
  };

  const getSimpleStatus = (status?: { state: string, description: string }) => {
    if (!status) return 'READY';
    const state = status.state || 'Okay';
    const desc = (status.description || '').toLowerCase();
    
    if (state === 'Hospital') return 'Hospital';
    if (state === 'Travel' || desc.includes('travel')) return 'Travel';
    if (state === 'Abroad' || desc.includes('abroad')) return 'Abroad';
    return state;
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-4 selection:bg-purple-500/30">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px]" />
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm relative z-10">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold tracking-tighter italic bg-gradient-to-r from-white via-purple-300 to-purple-600 bg-clip-text text-transparent">SHADOW BAZAAR</h1>
            <p className="text-gray-500 mt-1 font-mono text-[10px] uppercase tracking-widest">Torn Intelligence</p>
          </div>
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-purple-400" /> Secure Access</h2>
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(apiKey); }}>
              <div className="space-y-4">
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API KEY" className="w-full bg-black border border-white/5 rounded-xl py-3 px-4 text-sm text-purple-100 focus:border-purple-500/50 font-mono" />
                {error && <div className="text-red-400 text-xs bg-red-400/10 p-3 rounded-lg border border-red-400/20">{error}</div>}
                <button disabled={isLoading || !apiKey} className="w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 disabled:opacity-50 text-xs">INITIALIZE</button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10"><div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-[120px]" /></div>

      <header className="sticky top-0 z-50 bg-[#050505]/90 backdrop-blur-xl border-b border-white/5 py-2 px-4 md:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <h1 className="text-base md:text-lg font-black tracking-tighter italic bg-gradient-to-r from-white to-purple-400 bg-clip-text text-transparent">SHADOW BAZAAR</h1>
          </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setIsMuted(!isMuted); stopAlert(); }} className={`p-1.5 rounded-lg border transition-all ${isMuted ? 'bg-white/5 text-gray-500 border-white/5' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'}`}>
                  {isMuted ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                </button>
                <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/5 max-w-[150px] md:max-w-none">
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1 h-1 rounded-full ${userProfile?.last_action?.status === 'Online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : userProfile?.last_action?.status === 'Idle' ? 'bg-yellow-500' : 'bg-gray-500'}`} />
                      <span className="text-[10px] font-bold truncate max-w-[80px]">{userProfile?.name}</span>
                    </div>
                    <span className="text-[8px] text-purple-400 font-mono tracking-wider uppercase">
                      {getSimpleStatus(userProfile?.status)}
                    </span>
                  </div>
                  <User className="w-3 h-3 text-purple-400 shrink-0" />
                </div>
                <button onClick={handleLogout} className="p-1.5 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 hover:bg-red-500/20"><LogOut className="w-3.5 h-3.5" /></button>
              </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-3 md:p-6 space-y-4">
        {/* Active Alerts Quick List */}
        <AnimatePresence>
          {triggeredAlerts.length > 0 && (
            <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-500/10 border border-red-500/20 rounded-2xl overflow-hidden p-4 relative bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.1),transparent)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
                    <div className="absolute inset-0 bg-red-500 rounded-full blur-md opacity-20 animate-ping" />
                  </div>
                  <h2 className="text-sm font-black uppercase tracking-tighter text-red-400">Critical Price Alerts Detected</h2>
                </div>
                <div className="flex items-center gap-2">
                   <button onClick={() => { setIsMuted(!isMuted); stopAlert(); }} className="px-3 py-1 bg-black/40 border border-white/5 rounded-lg text-[9px] font-bold hover:bg-white/5 transition-all">
                     {isMuted ? 'UNMUTE ALARMS' : 'MUTE CURRENT'}
                   </button>
                   <button onClick={stopAlert} className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-lg text-[9px] font-bold text-red-400 hover:bg-red-500 hover:text-white transition-all">
                     STOP SOUND
                   </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {triggeredAlerts.slice(0, alertsToShowCount).map(id => {
                  const item = allItems.find(it => it.id === id) || selectedItems.find(it => it.id === id);
                  return (
                    <motion.div layout key={id} className="bg-black/40 border border-red-500/20 p-3 rounded-xl flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-500/10 rounded-lg border border-red-500/20 flex items-center justify-center p-1.5 shrink-0">
                          <img src={`https://www.torn.com/images/items/${id}/medium.png`} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-white">{item?.name || `ID:${id}`}</span>
                          <span className="text-[9px] font-mono text-red-400 font-bold uppercase">THRESHOLD REACHED</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setActiveItemId(id)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5">
                          <ExternalLink className="w-3 h-3 text-purple-400" />
                        </button>
                        <button onClick={() => setTriggeredAlerts(prev => prev.filter(a => a !== id))} className="p-2 bg-white/5 hover:bg-red-500/20 rounded-lg transition-colors border border-white/5 group-hover:border-red-500/30">
                          <X className="w-3 h-3 text-gray-500 group-hover:text-red-400" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              
              {triggeredAlerts.length > alertsToShowCount && alertsToShowCount < 5 && (
                <button onClick={() => setAlertsToShowCount(5)} className="w-full mt-3 py-2 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase text-gray-400 tracking-widest rounded-xl transition-all">
                  Show More (Up to 5)
                </button>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Compact Terminal Section */}
        <section className="bg-[#121212] border border-white/5 p-4 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><LayoutDashboard className="w-4 h-4 text-purple-500" /><h2 className="text-sm font-bold uppercase tracking-wider">Terminal</h2></div>
            <span className="bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded-full text-[9px] font-black border border-purple-500/20 uppercase">Units: {selectedItems.length}/10</span>
          </div>

          <div className="relative">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search Item Name, ID or Category..." 
                value={itemIdInput} 
                onChange={(e) => setItemIdInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && fuzzyResults[0] && fetchMarketData(fuzzyResults[0].id)} 
                className="w-full bg-black/60 border border-white/10 rounded-xl py-2.5 px-10 text-xs text-white focus:border-purple-500/40 font-mono" 
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            </div>
            {/* Fuzzy Suggestions Dropdown */}
            <AnimatePresence>
              {fuzzyResults.length > 0 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a]/95 backdrop-blur-3xl border border-white/10 rounded-xl overflow-hidden z-[60] shadow-2xl">
                  {fuzzyResults.map(res => (
                    <button key={res.id} onClick={() => fetchMarketData(res.id)} className="w-full px-4 py-2 hover:bg-purple-600/20 flex items-center justify-between text-left text-[11px] group transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-black/40 rounded-lg border border-white/5 flex items-center justify-center p-1 shrink-0">
                          <img src={`https://www.torn.com/images/items/${res.id}/medium.png`} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-gray-200 group-hover:text-purple-300">{res.name}</span>
                          <span className="text-[9px] text-gray-600 uppercase tracking-tighter">{res.category || 'Item'}</span>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono text-gray-500">ID:{res.id}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Horizontal Monitor List */}
          {selectedItems.length > 0 && (
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2 px-1">
                 <ArrowRightLeft className="w-3 h-3 text-purple-500" />
                 <span className="text-[9px] font-black uppercase text-gray-600 tracking-widest">Active Watchlist</span>
               </div>
               <div className="flex items-center gap-3 bg-black/40 p-2 rounded-xl border border-white/5 overflow-x-auto no-scrollbar">
                {selectedItems.map(item => (
                  <div key={item.id} className="flex flex-col gap-1.5 shrink-0">
                    <div className="flex items-center">
                      <button 
                        onClick={() => setActiveItemId(item.id)} 
                        className={`px-3 py-1 rounded-l-lg text-[10px] font-black transition-all border-y border-l whitespace-nowrap ${activeItemId === item.id ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/5'}`}
                      >
                        {item.name}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleItem(item); }} 
                        className={`px-2 py-1 rounded-r-lg border-y border-r transition-all group/close ${activeItemId === item.id ? 'bg-white/90 text-black border-white hover:bg-red-500 hover:text-white' : 'bg-white/10 text-gray-500 border-white/5 hover:text-red-400'}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-900/10 rounded-lg border border-purple-500/20 group hover:border-purple-500/40 transition-colors">
                        <AlertCircle className={`w-2.5 h-2.5 ${alertPrices[item.id] ? 'text-purple-400' : 'text-purple-900'}`} />
                        <input 
                          type="text" 
                          placeholder="Price Alert" 
                          value={formatDisplayValue(alertPrices[item.id] || '')} 
                          onChange={(e) => {
                            const parsed = parseNumericInput(e.target.value);
                            setAlertPrices(prev => ({ ...prev, [item.id]: parsed }));
                          }}
                          className="w-16 bg-transparent text-[9px] font-mono text-white focus:outline-none placeholder:text-gray-600"
                        />
                      </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Dashboard Content */}
        {activeItemId && marketData ? (
          <div className="space-y-4">
            {/* Horizontal Stats Strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-purple-900/10 border border-purple-500/20 p-3 rounded-xl flex flex-col justify-center">
                <span className="text-[8px] text-purple-400 font-bold uppercase truncate">Lowest Point</span>
                <div className="text-sm font-black text-white">${(marketData.listings[0]?.price || 0).toLocaleString('en-US')}</div>
              </div>
              <div className="bg-[#121212] border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                 <span className="text-[8px] text-gray-500 font-bold uppercase truncate">Bazaar Avg</span>
                 <div className="text-sm font-black">${marketData.bazaar_average.toLocaleString('en-US')}</div>
              </div>
              <div className="bg-[#121212] border border-white/5 p-3 rounded-xl flex flex-col justify-center text-right pr-4">
                 <span className="text-[8px] text-gray-500 font-bold uppercase truncate">Total Stock</span>
                 <div className="text-sm font-black">{marketData.total_listings.toLocaleString('en-US')}</div>
              </div>
            </div>

            {/* Dense Listing Table */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-3 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-black/20 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center border border-purple-500/20 shadow-lg shadow-purple-500/5">
                     <img src={`https://www.torn.com/images/items/${activeItemId}/medium.png`} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-purple-500" /> 
                        <span className="text-[11px] font-black uppercase text-white tracking-widest brightness-150">{selectedItems.find(i => i.id === activeItemId)?.name || 'Feed Intel'}</span>
                        {lastSyncTime && <span className="text-[8px] text-gray-700 font-mono ml-1 opacity-50 bg-white/5 px-1 rounded">SYNC: {lastSyncTime}</span>}
                      </div>
                    <span className="text-[8px] text-gray-600 font-mono">ENCRYPTED DATA STREAM</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:self-center self-end">
                  <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                    <div className="flex flex-col items-center">
                      <span className="text-[7px] text-purple-400 font-mono leading-none">{secondsLeft}s</span>
                      <span className="text-[6px] text-gray-700 font-black uppercase leading-none mt-0.5">TTL</span>
                    </div>
                    <div className="w-[1px] h-4 bg-white/5 mx-1" />
                    <span className="text-[8px] text-gray-500 font-black uppercase">Sync:</span>
                    <input 
                      type="number" 
                      value={autoRefreshInterval} 
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        setAutoRefreshInterval(v);
                        setSecondsLeft(v);
                        localStorage.setItem('shadow_refresh_interval', v.toString());
                      }} 
                      className="w-10 bg-transparent text-[10px] font-mono text-purple-400 text-center focus:outline-none border-b border-purple-500/20"
                    />
                  </div>

                  <button 
                    onClick={() => setShowFilters(!showFilters)} 
                    className={`p-1.5 rounded-lg border transition-all ${showFilters ? 'bg-purple-500 text-white border-purple-400' : 'bg-white/5 text-gray-500 border-white/5 hover:text-purple-400'}`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>

                  <button 
                    onClick={() => fetchMarketData(activeItemId).then(() => setSecondsLeft(autoRefreshInterval))} 
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 bg-purple-600/10 hover:bg-purple-600 text-purple-300 hover:text-white px-3 py-1 rounded-lg transition-all border border-purple-500/20 active:scale-95 group/sync"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : 'group-hover/sync:rotate-180 transition-transform duration-500'}`} />
                    <span className="text-[10px] font-black uppercase">{isRefreshing ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                </div>
              </div>

              {/* Advanced Filters Panel */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }} 
                    className="overflow-hidden border-b border-white/5 bg-black/40"
                  >
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Level Range */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-gray-500">User Level</span>
                          <div className="flex items-center gap-1">
                            <input 
                              type="text" 
                              value={formatDisplayValue(filters.minLevel.toString())} 
                              onChange={(e) => {
                                const val = parseNumericInput(e.target.value);
                                setFilters(prev => ({ ...prev, minLevel: parseInt(val) || 0 }));
                              }}
                              className="w-10 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-mono text-purple-400 focus:outline-none focus:border-purple-500"
                            />
                            <span className="text-gray-700 text-[10px]">-</span>
                            <input 
                              type="text" 
                              value={formatDisplayValue(filters.maxLevel.toString())} 
                              onChange={(e) => {
                                const val = parseNumericInput(e.target.value);
                                setFilters(prev => ({ ...prev, maxLevel: parseInt(val) || 0 }));
                              }}
                              className="w-10 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-mono text-purple-400 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Age Range */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-gray-500">Account Age (Days)</span>
                          <div className="flex items-center gap-1">
                            <input 
                              type="text" 
                              value={formatDisplayValue(filters.minAge.toString())} 
                              onChange={(e) => {
                                const val = parseNumericInput(e.target.value);
                                setFilters(prev => ({ ...prev, minAge: parseInt(val) || 0 }));
                              }}
                              className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-mono text-purple-400 focus:outline-none focus:border-purple-500"
                            />
                            <span className="text-gray-700 text-[10px]">-</span>
                            <input 
                              type="text" 
                              value={formatDisplayValue(filters.maxAge.toString())} 
                              onChange={(e) => {
                                const val = parseNumericInput(e.target.value);
                                setFilters(prev => ({ ...prev, maxAge: parseInt(val) || 0 }));
                              }}
                              className="w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[10px] font-mono text-purple-400 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Status Checkboxes */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-gray-500">Activity Filters</span>
                          <button 
                            onClick={resetFilters}
                            className="text-[9px] font-bold text-gray-600 hover:text-purple-400 uppercase tracking-tighter"
                          >
                            Reset All
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { group: 'connectivity', items: ['Online', 'Offline'] },
                            { group: 'location', items: ['In Torn', 'Travel', 'Abroad'] },
                            { group: 'health', items: ['Okay', 'Hospital'] }
                          ].map((cat) => (
                            <div key={cat.group} className="flex flex-wrap gap-2 p-1.5 bg-white/[0.02] rounded-lg border border-white/5">
                              {cat.items.map(status => {
                                const isActive = filters.statuses.includes(status);
                                return (
                                  <button 
                                    key={status}
                                    onClick={() => {
                                      setFilters(prev => {
                                        let newStatuses = [...prev.statuses];
                                        if (isActive) {
                                          newStatuses = newStatuses.filter(s => s !== status);
                                        } else {
                                          // Remove others in same group
                                          newStatuses = newStatuses.filter(s => !cat.items.includes(s));
                                          newStatuses.push(status);
                                        }
                                        return { ...prev, statuses: newStatuses };
                                      });
                                    }}
                                    className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all border ${isActive ? 'bg-purple-500 border-purple-400 text-white' : 'bg-white/5 border-white/10 text-gray-500 hover:border-white/20'}`}
                                  >
                                    {status === 'Okay' ? 'Okay (Safe)' : status}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative overflow-x-auto min-h-[400px]">
                {/* Non-intrusive loading bar */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/5 z-50 overflow-hidden">
                   {isSyncingSellers && (
                    <motion.div 
                      initial={{ left: '-100%' }}
                      animate={{ left: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-purple-500 to-transparent"
                    />
                  )}
                </div>

                {isSyncingSellers && (
                  <div className="absolute top-2 right-4 flex items-center gap-2 z-50 px-2 py-1 bg-black/80 border border-purple-500/20 rounded-md">
                    <RefreshCw className="w-2.5 h-2.5 text-purple-500 animate-spin" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-purple-400 italic">Enriching Intel...</span>
                  </div>
                )}

                <table className="w-full text-left font-mono">
                  <thead className="bg-[#050505] text-[9px] text-gray-600 uppercase tracking-widest border-b border-white/5">
                    <tr>
                      <th className="px-4 py-3">Sovereign Unit</th>
                      <th className="px-4 py-3">Trade Metrics</th>
                      <th className="px-4 py-3 text-right">Acquisition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {marketData.listings
                      .filter(listing => {
                        const seller = sellerDetails[listing.player_id];
                        // If no seller info yet, show it unless specifically filtered out by active filter choices
                        if (!seller) return true; 

                        const matchesLevel = seller.level >= filters.minLevel && seller.level <= filters.maxLevel;
                        const matchesAge = seller.age >= filters.minAge && seller.age <= filters.maxAge;
                        
                        // Status logic
                        if (filters.statuses.length === 0) return matchesLevel && matchesAge;

                        const matchesStatus = filters.statuses.length === 0 || (() => {
                          const statusGroups = [
                            { name: 'connectivity', items: ['Online', 'Offline'] },
                            { name: 'location', items: ['In Torn', 'Travel', 'Abroad'] },
                            { name: 'health', items: ['Okay', 'Hospital'] }
                          ];

                          // Check each group that has a selection
                          return statusGroups.every(group => {
                            const selectedInGroup = filters.statuses.filter(s => group.items.includes(s));
                            if (selectedInGroup.length === 0) return true; // No filter in this group, so it matches

                            // Must match at least one selected item in this group (OR within group)
                            return selectedInGroup.some(s => {
                              if (s === 'Okay') {
                                const simpleStatus = getSimpleStatus(seller.status);
                                return simpleStatus !== 'Hospital';
                              }
                              if (s === 'Online') return seller.last_action.status === 'Online';
                              if (s === 'Offline') return seller.last_action.status === 'Offline';
                              if (s === 'In Torn') {
                                const simpleStatus = getSimpleStatus(seller.status);
                                return simpleStatus !== 'Travel' && simpleStatus !== 'Abroad';
                              }
                              if (s === 'Travel') return getSimpleStatus(seller.status) === 'Travel';
                              if (s === 'Abroad') return getSimpleStatus(seller.status) === 'Abroad';
                              if (s === 'Hospital') return getSimpleStatus(seller.status) === 'Hospital';
                              return seller.status.state.includes(s) || seller.status.description.includes(s);
                            });
                          });
                        })();

                        return matchesLevel && matchesAge && matchesStatus;
                      })
                      .slice(0, listingsToShow).map((listing, index) => {
                        const seller = sellerDetails[listing.player_id];
                        const targetPrice = parseFloat(alertPrices[activeItemId] || '0');
                        const isQualifyingAlert = targetPrice > 0 && listing.price <= targetPrice;

                        return (
                          <motion.tr 
                            key={`${listing.player_id}-${index}`}
                            initial={{ opacity: 0, y: 5 }} 
                            animate={{ 
                              opacity: 1,
                              y: 0,
                              backgroundColor: isQualifyingAlert ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                              boxShadow: isQualifyingAlert ? 'inset 0 0 20px rgba(239, 68, 68, 0.1)' : 'none'
                            }}
                            transition={{ 
                              duration: 0.3,
                              delay: isSyncingSellers ? index * 0.02 : 0
                            }}
                            className={`group hover:bg-white/[0.02] transition-colors ${index === 0 && !isQualifyingAlert ? 'bg-purple-500/5' : ''} ${isQualifyingAlert ? 'border-l-2 border-red-500' : ''}`}
                          >
                          <td className="px-4 py-3">
                            <div className="flex flex-col min-w-[120px]">
                              <button onClick={() => window.open(`https://www.torn.com/bazaar.php?userId=${listing.player_id}#/`, '_blank')} className="text-[11px] font-bold text-purple-300 hover:text-white flex items-center gap-1.5 transition-colors text-left truncate max-w-[140px] group/name">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${seller?.last_action?.status === 'Online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : seller?.last_action?.status === 'Idle' ? 'bg-yellow-500' : 'bg-gray-700'}`} />
                                <span className="truncate">{listing.player_name || `User#${listing.player_id}`}</span>
                              </button>
                              {/* Horizontal sub-info colorful row */}
                              {seller ? (
                                <div className="flex items-center gap-2 mt-1 whitespace-nowrap overflow-x-auto no-scrollbar text-[9px]">
                                  <span className="text-purple-500/80 font-black">ID:{listing.player_id}</span>
                                  <span className="text-blue-400/80 font-bold">L:{seller.level}</span>
                                  <span className={getAgeColor(seller.age)}>{seller.age.toLocaleString('en-US')}D</span>
                                  <div className="flex items-center gap-1">
                                    <div className={`w-1 h-1 rounded-full ${seller.status.state === 'Okay' ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <span className={seller.status.state === 'Okay' ? 'text-green-500/80' : 'text-red-500/80'}>
                                      {getSimpleStatus(seller.status)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 mt-1 text-[8px] animate-pulse">
                                  <span className="text-gray-800 font-black italic tracking-widest bg-white/5 px-1 rounded">SCANNING INTEL...</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className={`text-[11px] font-black ${index === 0 ? 'text-purple-300' : 'text-white'}`}>${listing.price.toLocaleString('en-US')}</span>
                              <span className="text-[9px] font-bold text-gray-600">{listing.quantity.toLocaleString('en-US')} UNITS</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <a href={`https://www.torn.com/bazaar.php?userId=${listing.player_id}#/`} target="_blank" className="inline-flex items-center gap-1 bg-purple-600/10 hover:bg-purple-600 text-purple-400 hover:text-white border border-purple-500/30 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all shadow-lg active:scale-95 group/buy">
                              Buy Now <ArrowRightLeft className="w-3 h-3 group-hover/buy:translate-x-0.5 transition-transform" />
                            </a>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {marketData.listings.length > listingsToShow && (
                <button onClick={() => setListingsToShow(prev => prev + 5)} className="w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.05] transition-all text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Append Nodes (+5)</button>
              )}
            </div>

            {/* Compact Oracle & Footer Tools */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#121212] border border-white/5 p-4 rounded-xl">
                 <div className="flex items-center gap-2 mb-3"><Calculator className="w-4 h-4 text-purple-500" /><h2 className="text-xs font-bold uppercase">Margin Oracle</h2></div>
                 <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-600 uppercase font-bold pl-1">In</label>
                      <input type="text" value={formatDisplayValue(buyPrice)} onChange={(e) => setBuyPrice(parseNumericInput(e.target.value))} placeholder="0" className="w-full bg-black border border-white/5 rounded-lg py-2 px-3 text-xs font-mono" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-600 uppercase font-bold pl-1">Out</label>
                      <input type="text" value={formatDisplayValue(sellPrice)} onChange={(e) => setSellPrice(parseNumericInput(e.target.value))} placeholder="0" className="w-full bg-black border border-white/5 rounded-lg py-2 px-3 text-xs font-mono" />
                    </div>
                 </div>
                 <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Delta</span>
                    <span className={`text-xs font-black font-mono ${calculateProfit() >= 0 ? 'text-green-400' : 'text-red-400'}`}>${calculateProfit().toLocaleString('en-US')}</span>
                 </div>
              </div>

              <div className="bg-purple-900/5 border border-purple-500/10 p-4 rounded-xl flex items-center gap-3">
                <Info className="w-4 h-4 text-purple-400 shrink-0" />
                <p className="text-[9px] text-gray-500 italic leading-tight">Feed sync active (30s). Seller intelligence cached for performance. Unauthorized data scraping strictly prohibited.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-gray-700 border-2 border-dashed border-white/5 rounded-2xl bg-[#121212]/20">
            <TrendingUp className="w-8 h-8 opacity-5 mb-2" />
            <p className="font-mono text-[10px] uppercase tracking-[0.5em] italic">System Standby</p>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto p-6 text-center border-t border-white/5 opacity-30 mt-8">
        <div className="text-[8px] font-mono uppercase tracking-[0.3em]">Shadow Bazaar Protocol // Node: {(activeItemId || 'null').substring(0,6)} // UTC: {new Date().toISOString().split('T')[0]}</div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #333; }
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
      `}} />
    </div>
  );
}
