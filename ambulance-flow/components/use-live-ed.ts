'use client';
import { useEffect, useState } from 'react';
import { EMPTY_ED, type EdSnapshot } from '@/lib/live-ed';

export function useLiveEd() {
  const [data,setData]=useState<{snapshot:EdSnapshot;evaluatedAt:string}>({snapshot:EMPTY_ED,evaluatedAt:''});
  useEffect(()=> {
    let active=true;let pending=false;const abort=new AbortController();
    async function refresh() {
      if(pending)return;pending=true;
      try {
        const response=await fetch('/api/ed-data',{cache:'no-store',signal:abort.signal});
        if(response.ok) { const value=await response.json() as typeof data;if(active)setData(value); }
        else if(active)setData(old=>({...old,snapshot:{...old.snapshot,error:'Live ED feed unavailable. Retrying shortly.'},evaluatedAt:new Date().toISOString()}));
      } catch { if(active)setData(old=>({...old,snapshot:{...old.snapshot,error:'Live ED feed unavailable. Retrying shortly.'},evaluatedAt:new Date().toISOString()})); }
      finally {pending=false;}
    }
    void refresh();
    // Minute UI poll ages readings; shared server cache fetches provider every 15m.
    const timer=setInterval(()=>void refresh(),60000);
    return ()=>{active=false;abort.abort();clearInterval(timer);};
  },[]);
  return data;
}
