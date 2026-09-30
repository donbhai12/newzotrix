'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, clearToken, downloadText, getToken, setToken } from './api';
import { LOGO_SRC } from './branding';

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const indiaDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: INDIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const indiaCurrencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const indiaMonthFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: INDIA_TIME_ZONE, month: 'long', year: 'numeric' });
const todayISO = () => {
  const parts = Object.fromEntries(indiaDateFormatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const fmtDate = (iso) => {
  if (!iso) return '-';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '-';
};
const money = (n) => indiaCurrencyFormatter.format(Number(n || 0));
const escCsv = (v) => { const s=String(v??''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
const initials = (name='') => String(name).split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const statusText = {P:'Present',H:'Half',A:'Absent','-':'-'};
const canViewAccounting = user => user.role==='master'||(user.accountingCategories||['*']).includes('*')||(user.accountingCategories||[]).length>0;

function App(){
  const [user,setUser]=useState(null), [worker,setWorker]=useState(null), [loading,setLoading]=useState(true);
  const [view,setView]=useState('dashboard'), [settings,setSettings]=useState(null);
  const [dashboard,setDashboard]=useState(null), [projects,setProjects]=useState([]), [workers,setWorkers]=useState([]), [expenses,setExpenses]=useState([]), [users,setUsers]=useState([]);
  const [toastMsg,setToastMsg]=useState(''), [modal,setModal]=useState(null);
  const [sidebarOpen,setSidebarOpen]=useState(false), [globalSearch,setGlobalSearch]=useState('');
  const searchRef=useRef(null);

  const toast=useCallback((m)=>{setToastMsg(m);window.clearTimeout(window.__zToast);window.__zToast=window.setTimeout(()=>setToastMsg(''),2600)},[]);
  const logout=useCallback(()=>{clearToken();setUser(null);setWorker(null);setDashboard(null);setView('dashboard')},[]);

  useEffect(()=>{ const h=()=>logout(); window.addEventListener('zotrix:logout',h); return()=>window.removeEventListener('zotrix:logout',h)},[logout]);
  useEffect(()=>{ const h=(event)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus()}}; window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h)},[]);

  const loadMe=useCallback(async()=>{
    const data=await api('/auth/me'); setUser(data.user); setWorker(data.worker||null); return data;
  },[]);
  const loadProjects=useCallback(async()=>{setProjects(await api('/projects'))},[]);
  const loadWorkers=useCallback(async()=>{setWorkers(await api('/workers'))},[]);
  const loadExpenses=useCallback(async()=>{setExpenses(await api('/expenses'))},[]);
  const loadSettings=useCallback(async()=>{setSettings(await api('/settings'))},[]);
  const loadDashboard=useCallback(async()=>{setDashboard(await api('/dashboard'))},[]);
  const loadUsers=useCallback(async()=>{if(user?.role==='master')setUsers(await api('/auth/users'))},[user?.role]);

  const refreshAll=useCallback(async()=>{
    if(!user) return;
    setLoading(true);
    try{
      await Promise.all([loadSettings(),loadProjects(),loadWorkers(),loadExpenses(),loadDashboard(), user.role==='master'?loadUsers():Promise.resolve()]);
    }finally{setLoading(false)}
  },[user,loadSettings,loadProjects,loadWorkers,loadExpenses,loadDashboard,loadUsers]);

  useEffect(()=>{(async()=>{
    if(!getToken()){setLoading(false);return}
    try{await loadMe()}catch{clearToken()}finally{setLoading(false)}
  })()},[loadMe]);

  useEffect(()=>{if(user) refreshAll()},[user,refreshAll]);

  if(loading && !user) return <div className="screen-loader"><div className="loader-dot"/><b>Loading Zotrix Research Private Ltd-</b></div>;
  if(!user) return <LoginScreen onLogin={(data)=>{setToken(data.token);setUser(data.user);setWorker(data.worker||null)}} toast={toast}/>;
  if(user.role==='labour') return <div className="worker-shell"><button className="btn light worker-profile-button" onClick={()=>setModal({type:'profile'})}>My Profile</button><WorkerPortal user={user} worker={worker} dashboard={dashboard} settings={settings} onLogout={logout} onPasswordChange={()=>setModal({type:'password'})} toast={toast}/>{modal&&<ModalHost modal={modal} close={()=>setModal(null)} setModal={setModal} user={user} settings={settings} projects={projects} workers={workers} users={users} refreshAll={refreshAll} refreshWorkers={loadWorkers} refreshExpenses={loadExpenses} refreshProjects={loadProjects} toast={toast}/>}</div>;

  const managerViews={dashboard:<Dashboard user={user} settings={settings} data={dashboard} projects={projects} workers={workers} expenses={expenses} canEditProjects={user.role==='master'} canViewExpenses={canViewAccounting(user)} onRefresh={loadDashboard} onView={setView} toast={toast}/>,
    projects:<ProjectsView projects={projects} workers={workers} expenses={expenses} canEdit={user.role==='master'} onRefresh={async()=>{await loadProjects();await loadDashboard()}} openModal={setModal} toast={toast}/>,
    labour:<LabourView workers={workers} projects={projects} expenses={expenses} canEdit={user.role==='master'} onRefresh={async()=>{await loadWorkers();await loadExpenses();await loadDashboard()}} openModal={setModal} toast={toast}/>,
    expenses:<ExpensesView expenses={expenses} projects={projects} workers={workers} users={users} settings={user.role==='admin'&&!user.accountingCategories?.includes('*')?{...settings,categories:(settings?.categories||[]).filter(category=>user.accountingCategories?.includes(category))}:settings} canEdit={user.role==='master'} onRefresh={async()=>{await loadExpenses();await loadDashboard()}} openModal={setModal} toast={toast}/>,
    master:<MasterView users={users} workers={workers} settings={settings} projects={projects} onRefresh={async()=>{await loadUsers();await loadWorkers();await loadSettings();await loadDashboard()}} openModal={setModal} toast={toast}/>
  };

  return <div className="app-shell">
    <Sidebar view={view} setView={(v)=>{setView(v);setSidebarOpen(false)}} user={user} settings={settings} open={sidebarOpen} onClose={()=>setSidebarOpen(false)} onLogout={logout}/>
    <main className="main-area">
      <Topbar user={user} settings={settings} searchRef={searchRef} globalSearch={globalSearch} setGlobalSearch={(q)=>{setGlobalSearch(q); if(q.trim()){
        const l=q.toLowerCase(); const p=projects.find(x=>`${x.name} ${x.code} ${x.client}`.toLowerCase().includes(l)); const w=workers.find(x=>`${x.name} ${x.role} ${x.mobile}`.toLowerCase().includes(l)); setView(p?'projects':w?'labour':'expenses');
      }}} openMenu={()=>setSidebarOpen(true)} onProfile={()=>setModal({type:'profile'})}/>
      <div className="content-wrap">
        {managerViews[view] || managerViews.dashboard}
      </div>
    </main>
    <MobileNav view={view} setView={setView} user={user}/>
    {modal && <ModalHost modal={modal} close={()=>setModal(null)} setModal={setModal} user={user} settings={settings} projects={projects} workers={workers} users={users} refreshAll={refreshAll} refreshWorkers={loadWorkers} refreshExpenses={loadExpenses} refreshProjects={loadProjects} toast={toast}/>} 
    {toastMsg && <div className="toast show">{toastMsg}</div>}
  </div>;
}

function LoginScreen({onLogin,toast}){
  const [branding,setBranding]=useState({});
  const [setup,setSetup]=useState(true), [id,setId]=useState(''), [password,setPassword]=useState(''), [name,setName]=useState('Master Owner'), [setupKey,setSetupKey]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [setupAvailable,setSetupAvailable]=useState(true), [setupStatusError,setSetupStatusError]=useState(false);
  const [showPassword,setShowPassword]=useState(false);
  const [showSetupKey,setShowSetupKey]=useState(false);
  useEffect(()=>{api('/auth/setup-status').then(result=>{setSetupAvailable(result.setupAvailable);setSetup(result.setupAvailable);setSetupStatusError(false)}).catch(()=>{setSetupAvailable(true);setSetup(true);setSetupStatusError(true)}); api('/settings/public').then(setBranding).catch(()=>{})},[]);
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{
    const data=setup ? await api('/auth/bootstrap',{method:'POST',body:JSON.stringify({setupKey,name,loginId:id,password})}) : await api('/auth/login',{method:'POST',body:JSON.stringify({loginId:id,password})});
    if(setup)setSetupAvailable(false); onLogin(data); toast(setup?'Master account created':'Signed in');
  }catch(err){setError(err.message)}finally{setBusy(false)}}
  return <div className="login-screen"><div className="tri-line"/><div className="login-glow one"/><div className="login-glow two"/>
    <form className="login-box" onSubmit={submit}>
      <div className="brand-row"><div className="brand-mark logo-image"><img src={branding.logoUrl||LOGO_SRC} alt="Zotrix Research Private Ltd logo" /></div><div><h1>Zotrix Research Private Ltd</h1><small>Project Operations</small></div></div>
      <div className="chakra login-logo-hero"><img src={branding.logoUrl||LOGO_SRC} alt="Zotrix Research Private Ltd logo" /></div><h2>{setup?'First-time Setup':'Welcome Back'}</h2><p className="muted center">{setup?'Create the one Master account for this system.':'Sign in to continue to your workspace.'}</p>
      {setup&&<div className="field"><label>Your Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Master Owner"/></div>}
      <div className="field"><label>User ID</label><input value={id} onChange={e=>setId(e.target.value.toUpperCase())} placeholder="User ID" autoComplete="username"/></div>
      <div className="field"><label htmlFor="login-password">Password</label><div className="password-input-wrap"><input id="login-password" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" autoComplete={setup?'new-password':'current-password'}/><button className="password-visibility" type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword}><Icon name={showPassword?'eyeOff':'eye'}/></button></div></div>
      {setup&&<div className="field"><label htmlFor="setup-key">Setup Key</label><div className="password-input-wrap"><input id="setup-key" type={showSetupKey?'text':'password'} value={setupKey} onChange={e=>setSetupKey(e.target.value)} placeholder="SETUP_KEY from server" autoComplete="off"/><button className="password-visibility" type="button" onClick={()=>setShowSetupKey(value=>!value)} aria-label={showSetupKey?'Hide setup key':'Show setup key'} aria-pressed={showSetupKey}><Icon name={showSetupKey?'eyeOff':'eye'}/></button></div></div>}
      {setupStatusError&&<div className="setup-status-warning" role="alert">Could not verify setup status. Check the database connection; the server will only create a Master if one does not already exist.</div>}
      {error&&<div className="error-box">{error}</div>}
      <button className="btn primary wide" disabled={busy}>{busy?'Please wait-':setup?'Create Master & Continue':'Sign In'} <b>-&gt;</b></button>
      {!setup&&setupAvailable&&<button type="button" className="ghost-link" onClick={()=>setSetup(true)}>First time? Set up Master account</button>}
      {setup&&<button type="button" className="ghost-link" onClick={()=>setSetup(false)}>Back to sign in</button>}
    </form>
    <div className="login-footer">Zotrix Research Private Ltd - secure workspace</div>
  </div>
}

function Icon({name}){
  const paths={
    grid:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    eye:<><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff:<><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.4 0 10 6 10 6a16 16 0 0 1-3.1 3.7M6.2 6.8C3.5 8.5 2 12 2 12s3.6 6 10 6a10.7 10.7 0 0 0 3.2-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
    folder:<><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M3 9h18"/></>,
    users:<><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3"/><path d="M16 11a3 3 0 0 0 0-6M18 15a3.5 3.5 0 0 1 3 3.5V20"/></>,
    wallet:<><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h14.5A2.5 2.5 0 0 1 21 10.5V15h-4a2.5 2.5 0 0 1 0-5h4"/><circle cx="17" cy="12.5" r=".7" fill="currentColor" stroke="none"/></>,
    shield:<><path d="m12 3 7 3v5c0 4.7-3 8.2-7 10-4-1.8-7-5.3-7-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    search:<><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 5 5"/></>,
    menu:<><path d="M4 7h16M4 12h16M4 17h16"/></>,
    chevron:<path d="m9 6 6 6-6 6"/>,
    refresh:<><path d="M20 11a8 8 0 0 0-14.7-4L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4L20 15"/><path d="M20 20v-5h-5"/></>,
    plus:<><path d="M12 5v14M5 12h14"/></>
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.grid}</svg>;
}
function Sidebar({view,setView,user,settings,open,onClose,onLogout}){const scope=user.role==='admin'&&user.accessControlEnabled?'Assigned workspace':'Full workspace';return <aside className={`sidebar ${open?'open':''}`}>
  <div className="sidebar-inner">
    <div className="side-brand"><div className="brand-mark small logo-image"><img src={settings?.logoUrl||LOGO_SRC} alt="Zotrix Research Private Ltd logo" /></div><div><h2>{settings?.businessName||'Zotrix Research Private Ltd'}</h2><span>Operations Workspace</span></div></div>
    <div className="workspace-box"><div className="workspace-label"><span className="live-dot"/> {scope}</div><b>{user.name}</b><span>{user.role==='master'?'Master Admin':user.role==='admin'?'Administrator':'Labour'}</span></div>
    <div className="nav-section-label">Workspace</div><nav className="nav-list">
      <NavBtn icon="grid" label="Dashboard" active={view==='dashboard'} onClick={()=>setView('dashboard')}/>
      <NavBtn icon="folder" label="Projects" active={view==='projects'} onClick={()=>setView('projects')}/>
      <NavBtn icon="users" label="Labour" active={view==='labour'} onClick={()=>setView('labour')}/>
      {canViewAccounting(user)&&<NavBtn icon="wallet" label="Money & Expenses" active={view==='expenses'} onClick={()=>setView('expenses')}/ >}
      {user.role==='master'&&<><div className="nav-section-label nav-section-gap">Administration</div><NavBtn icon="shield" label="Master Control" active={view==='master'} onClick={()=>setView('master')}/></>} 
    </nav>
  </div>
  <div className="side-bottom"><button className="btn light wide" onClick={onLogout}>Logout <Icon name="chevron"/></button></div>
  <button className="sidebar-close" aria-label="Close navigation" onClick={onClose}>×</button>
</aside>}
function NavBtn({icon,label,active,onClick}){return <button className={`nav-btn ${active?'active':''}`} onClick={onClick}><span className="nav-icon"><Icon name={icon}/></span><b>{label}</b>{active&&<i className="nav-active-dot"/>}</button>}
function Topbar({user,settings,searchRef,globalSearch,setGlobalSearch,openMenu,onProfile}){const scope=user.role==='admin'&&user.accessControlEnabled?'Assigned data':'Full access';return <header className="topbar"><div className="topbar-left"><button className="menu-button" aria-label="Open navigation" onClick={openMenu}><Icon name="menu"/></button><div className="global-search"><Icon name="search"/><input ref={searchRef} value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} placeholder="Search projects, labour or expenses" aria-label="Search projects, labour or expenses"/><kbd>Ctrl K</kbd></div></div><button className="profile-chip" onClick={onProfile} aria-label="Open profile"><span className="avatar">{user.photoUrl?<img src={user.photoUrl} alt=""/>:<span>{initials(user.name)}</span>}</span><span><b>{user.name}</b><small><i className="profile-status"/> {scope}</small></span><Icon name="chevron"/></button></header>}
function MobileNav({view,setView,user}){return <div className="mobile-nav"><button className={view==='dashboard'?'active':''} aria-label="Dashboard" onClick={()=>setView('dashboard')}><Icon name="grid"/><span>Home</span></button><button className={view==='projects'?'active':''} aria-label="Projects" onClick={()=>setView('projects')}><Icon name="folder"/><span>Projects</span></button><button className={view==='labour'?'active':''} aria-label="Labour" onClick={()=>setView('labour')}><Icon name="users"/><span>Labour</span></button>{canViewAccounting(user)&&<button className={view==='expenses'?'active':''} aria-label="Money and expenses" onClick={()=>setView('expenses')}><Icon name="wallet"/><span>Money</span></button>}</div>}
function PageHead({title,subtitle,actions}){return <div className="page-head"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{actions&&<div className="page-actions">{actions}</div>}</div>}
function Kpi({label,value,sub,className=''}){return <div className={`card kpi ${className}`}><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>}

function indiaHour(){
  const hour=Number(new Intl.DateTimeFormat('en-IN',{timeZone:INDIA_TIME_ZONE,hour:'2-digit',hour12:false}).format(new Date()));
  return hour===24?0:hour;
}
function DashboardWelcome({user,settings,projects,workers,onView,canEditProjects,canViewExpenses}){
  const [typed,setTyped]=useState('');
  const hour=indiaHour();
  const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const message=`${greeting}, ${user?.name||'Admin'}`;
  useEffect(()=>{
    let index=0;
    setTyped('');
    const timer=window.setInterval(()=>{index+=1;setTyped(message.slice(0,index));if(index>=message.length)window.clearInterval(timer)},42);
    return()=>window.clearInterval(timer);
  },[message]);
  return <section className="dashboard-welcome">
    <div className="welcome-copy"><span className="eyebrow">Zotrix Research Private Ltd <i/> Workspace</span><h1>{typed}<span className="typing-cursor" aria-hidden="true"/></h1><p>Your India workspace is ready. Review your assigned operations and keep every update moving.</p><div className="welcome-meta"><span className="live-pill"><i/> Live now</span><span>{projects.length} project{projects.length===1?'':'s'}</span><span>{workers.length} labour record{workers.length===1?'':'s'}</span><span>{fmtDate(todayISO())}</span></div></div>
    <div className="welcome-side"><div className="welcome-orb"><img src={settings?.logoUrl||LOGO_SRC} alt=""/></div><div className="welcome-actions">{canViewExpenses&&<button className="btn gold" onClick={()=>onView('expenses')}>Track expense <b>+</b></button>}{canEditProjects&&<button className="btn primary" onClick={()=>onView('projects')}>New project <b>+</b></button>}</div></div>
  </section>
}
function Dashboard({user,settings,data,projects,workers,expenses,onRefresh,onView,toast,canEditProjects,canViewExpenses}){
  if(!data) return <SectionLoader/>;
  if(data.mode==='labour') return null;
  const {kpi,trend,category,projectSpend,todayRows,recent}=data;
  const trendMax=Math.max(1,...trend.map(x=>x.total)); const cats=Object.entries(category||{}).sort((a,b)=>b[1]-a[1]).slice(0,5); const catTotal=cats.reduce((a,[,v])=>a+v,0)||1;
  return <div>
    <DashboardWelcome user={user} settings={settings} projects={projects} workers={workers} onView={onView} canEditProjects={canEditProjects} canViewExpenses={canViewExpenses}/>
    <div className="dashboard-section-head"><div><span className="eyebrow dark">Portfolio overview</span><h2>Operations at a glance</h2></div><button className="btn soft" onClick={onRefresh}>Refresh data</button></div>
    <div className="kpi-grid"><Kpi label="Projects" value={kpi.projects} sub="Current portfolio" className="accent-green"/><Kpi label="Active Labour" value={kpi.activeWorkers} sub={`${workers.length} total records`} className="accent-cyan"/><Kpi label="Money Out" value={money(kpi.totalExpense)} sub="Last 30 days" className="accent-red"/><Kpi label="Labour Paid" value={money(kpi.totalLabourPaid)} sub="Recorded payments" className="accent-gold"/><Kpi label="Labour Due" value={money(kpi.labourDue)} sub="Earned minus paid" className="accent-blue"/></div>
    <div className="two-col top-gap"><div className="card chart-card"><SectionTitle title="Expense Trend" badge="Last 14 days"/><div className="bar-chart">{trend.map(x=><div className="bar-col" key={x.date}><div className="bar-wrap"><div className="bar" style={{height:`${Math.max(4,x.total/trendMax*100)}%`}} title={`${fmtDate(x.date)} ${money(x.total)}`}/></div><small>{x.date.slice(8)}</small></div>)}</div></div>
      <div className="card chart-card"><SectionTitle title="Expense Split by Category" badge="Last 30 days"/><div className="donut-layout"><div className="donut" style={{background:cats.length?`conic-gradient(${cats.map(([,v],i)=>{const colors=['#E07A2D','#15835B','#1F6B4F','#2D9B70','#D5485B'];const start=cats.slice(0,i).reduce((s,[,vv])=>s+vv,0)/catTotal*100;const end=start+v/catTotal*100;return `${colors[i]} ${start}% ${end}%`}).join(',')})`:'#E5EBE6'}}><b>{money(catTotal)}</b></div><div className="legend-list">{cats.map(([k,v],i)=><div key={k}><span><i style={{background:['#E07A2D','#15835B','#1F6B4F','#2D9B70','#D5485B'][i]}}/>{k}</span><b>{money(v)}</b></div>)}</div></div></div></div>
    <div className="two-col top-gap"><ProjectSpendCard projects={projects} spend={projectSpend}/><LabourStrength workers={workers} projects={projects}/></div>
    <div className="two-col top-gap"><MoneyTypeChart expenses={expenses}/><TodayAttendance rows={todayRows}/></div>
    <div className="card top-gap"><SectionTitle title="Recent Money Out" badge="Live"/><div className="money-feed">{recent?.slice(0,10).map(e=><div className="money-item" key={e._id}><b>{fmtDate(e.date)}</b><span><strong>{e.description}</strong><small>{e.projectId?.name||'Unassigned'} - {e.type}</small></span><em>{money(e.amount)}</em></div>) || <Empty/>}</div>{canViewExpenses&&<button className="btn light" onClick={()=>onView('expenses')}>Open Daily Track -&gt;</button>}</div>
  </div>
}function ProjectSpendCard({projects,spend}){const rows=projects.map(p=>({...p,spent:spend?.[p._id]||0})).sort((a,b)=>b.spent-a.spent).slice(0,6);const max=Math.max(1,...rows.map(r=>r.spent));return <div className="card"><SectionTitle title="Project-wise Expense" badge="Live"/>{rows.map(p=><div className="stat-line" key={p._id}><span><b>{p.name}</b><small>{p.client||p.location||'-'}</small></span><span className="stat-value">{money(p.spent)}</span><div className="mini-progress"><i style={{width:`${p.spent/max*100}%`}}/></div></div>) || <Empty/>}</div>}
function LabourStrength({workers,projects}){return <div className="card"><SectionTitle title="Labour Strength by Project" badge="Active"/>{projects.map(p=>{const n=workers.filter(w=>String(w.projectId)===String(p._id)&&w.status==='Active').length;return <div className="stat-line" key={p._id}><span><b>{p.name}</b><small>{n} active labour</small></span><span className="stat-value">{n}</span></div>})}</div>}
function MoneyTypeChart({expenses}){const types={};expenses.forEach(e=>types[e.type]=(types[e.type]||0)+Number(e.amount||0));const rows=Object.entries(types).sort((a,b)=>b[1]-a[1]);const max=Math.max(1,...rows.map(x=>x[1]));return <div className="card"><SectionTitle title="Money Out by Type" badge="All entries"/><div className="hbar-list">{rows.map(([k,v])=><div key={k}><div><span>{k}</span><b>{money(v)}</b></div><i style={{width:`${v/max*100}%`}}/></div>)}</div></div>}
function TodayAttendance({rows=[]}){const counts={P:rows.filter(x=>x.status==='P').length,H:rows.filter(x=>x.status==='H').length,A:rows.filter(x=>x.status==='A').length};return <div className="card"><SectionTitle title="Today's Attendance" badge="Auto Present"/><div className="attendance-summary"><div className="att-card p"><b>{counts.P}</b><span>Present</span></div><div className="att-card h"><b>{counts.H}</b><span>Half</span></div><div className="att-card a"><b>{counts.A}</b><span>Absent</span></div></div><div className="compact-list">{rows.slice(0,8).map(r=><div key={String(r.workerId)}><span>{r.name}</span><span className={`tag ${r.status==='P'?'green':r.status==='H'?'amber':r.status==='A'?'red':'light'}`}>{statusText[r.status]}</span></div>)}</div></div>}

function ProjectsView({projects,workers,expenses,onRefresh,openModal,toast,canEdit}){
  const [q,setQ]=useState(''), [status,setStatus]=useState('all'), [selected,setSelected]=useState(null);
  const list=projects.filter(p=>(status==='all'||p.status===status)&&(!q||`${p.name} ${p.code} ${p.client} ${p.location}`.toLowerCase().includes(q.toLowerCase())));
  const projectWorkers=selected?workers.filter(w=>String(w.projectId)===String(selected._id)):[];
  const projectExpenses=selected?expenses.filter(e=>String(e.projectId?._id||e.projectId)===String(selected._id)):[];
  const spent=projectExpenses.reduce((total,e)=>total+Number(e.amount||0),0);
  return <div><PageHead title="Projects" subtitle="Project status, workforce, spending and delivery progress" actions={canEdit&&<button className="btn primary" onClick={()=>openModal({type:'project',item:null})}>+ Add Project</button>}/><div className="filterbar"><input placeholder="Search project, client, site..." value={q} onChange={e=>setQ(e.target.value)}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All Status</option><option>Active</option><option>Planning</option><option>Hold</option><option>Completed</option></select></div><div className="project-grid">{list.map(p=>{const total=expenses.filter(e=>String(e.projectId?._id||e.projectId)===String(p._id)).reduce((sum,e)=>sum+Number(e.amount||0),0);const active=workers.filter(w=>String(w.projectId)===String(p._id)&&w.status==='Active').length;return <article className="project-card card" key={p._id} role="button" tabIndex="0" onClick={()=>setSelected(p)} onKeyDown={e=>e.key==='Enter'&&setSelected(p)}><div className="project-head"><div><h3>{p.name}</h3><small>{p.code||'No code'} - {p.client||'-'} - {p.location||'-'}</small></div><span className={`tag ${p.status==='Active'?'green':p.status==='Completed'?'blue':'amber'}`}>{p.status}</span></div><div className="project-metrics"><div><small>Budget</small><b>{money(p.budget)}</b></div><div><small>Total spent</small><b>{money(total)}</b></div><div><small>Balance</small><b>{money(Math.max(0,p.budget-total))}</b></div><div><small>Working now</small><b>{active}</b></div></div><div className="progress-label"><span>Progress</span><b>{p.progress}%</b></div><div className="progress"><i style={{width:`${p.progress}%`}}/></div><div className="project-foot"><small>{fmtDate(p.start)} -&gt; {fmtDate(p.end)}</small><span className="btn small light">View details -&gt;</span></div></article>})}{!list.length&&<Empty/>}</div>{selected&&<Modal title={selected.name} close={()=>setSelected(null)} wide><div className="report-grid"><Stat label="Status" value={selected.status}/><Stat label="Progress" value={`${selected.progress}%`}/><Stat label="Budget" value={money(selected.budget)}/><Stat label="Total expenses" value={money(spent)}/><Stat label="Budget remaining" value={money(Math.max(0,selected.budget-spent))}/><Stat label="Working now" value={projectWorkers.filter(w=>w.status==='Active').length}/><Stat label="Worked on project" value={projectWorkers.length}/><Stat label="Labour payroll paid" value={money(projectExpenses.filter(e=>e.type==='Labour Payment').reduce((sum,e)=>sum+Number(e.amount||0),0))}/></div><div className="progress-label top-gap"><span>Project progress</span><b>{selected.progress}%</b></div><div className="progress"><i style={{width:`${selected.progress}%`}}/></div><SectionTitle title="Labour" badge={`${projectWorkers.length} records`}/><div className="table-wrap"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th>Daily wage</th></tr></thead><tbody>{projectWorkers.map(w=><tr key={w._id}><td>{w.name}</td><td>{w.role}</td><td>{w.status}</td><td>{fmtDate(w.joining)}</td><td>{money(w.wage)}</td></tr>)}{!projectWorkers.length&&<tr><td colSpan="5"><Empty/></td></tr>}</tbody></table></div><SectionTitle title="Expenses" badge={`${projectExpenses.length} entries`}/><div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Paid to</th><th>Amount</th></tr></thead><tbody>{projectExpenses.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=><tr key={e._id}><td>{fmtDate(e.date)}</td><td>{e.type}</td><td>{e.category}</td><td>{e.description}</td><td>{e.paidTo||e.workerId?.name||'-'}</td><td>{money(e.amount)}</td></tr>)}{!projectExpenses.length&&<tr><td colSpan="6"><Empty/></td></tr>}</tbody></table></div>{canEdit&&<div className="form-actions"><button className="btn light" onClick={()=>{setSelected(null);openModal({type:'project',item:selected})}}>Edit project</button><button className="btn red" onClick={async()=>{if(!confirm('Delete this project?'))return;try{await api(`/projects/${selected._id}`,{method:'DELETE'});setSelected(null);toast('Project deleted');await onRefresh()}catch(e){toast(e.message)}}}>Delete project</button></div>}</Modal>}</div>
}

function LabourView({workers,projects,expenses,onRefresh,openModal,toast}){
  const [q,setQ]=useState(''), [project,setProject]=useState('all'), [status,setStatus]=useState('all'), [attDate,setAttDate]=useState(todayISO());
  const list=workers.filter(w=>(status==='all'||w.status===status)&&(project==='all'||String(w.projectId)===project)&&(!q||`${w.name} ${w.role} ${w.mobile}`.toLowerCase().includes(q.toLowerCase())));
  const active=workers.filter(w=>w.status==='Active').length; const paid=expenses.filter(e=>e.type==='Labour Payment').reduce((a,e)=>a+Number(e.amount||0),0);
  return <div><PageHead title="Labour Management" subtitle="Attendance, wages, worker ledger and payment history" actions={<><button className="btn green" onClick={()=>openModal({type:'attendance',date:attDate})}>Attendance</button><button className="btn primary" onClick={()=>openModal({type:'worker',item:null})}>+ Add Labour</button></>}/>
    <div className="kpi-grid"><Kpi label="Active Labour" value={active} sub={`${workers.length} total`} className="accent-green"/><Kpi label="Today" value={attDate===todayISO()?'Current day':fmtDate(attDate)} sub="Attendance sheet" className="accent-blue"/><Kpi label="Paid to Labour" value={money(paid)} sub="Recorded labour payments" className="accent-gold"/><Kpi label="Paid to Labour" value={money(paid)} sub="Labour Payment entries" className="accent-red"/><Kpi label="Stopped" value={workers.filter(w=>w.status==='Stopped').length} sub="History retained" className="accent-cyan"/></div>
    <div className="card top-gap"><div className="filterbar"><input placeholder="Search labour / mobile..." value={q} onChange={e=>setQ(e.target.value)}/><select value={project} onChange={e=>setProject(e.target.value)}><option value="all">All Projects</option>{projects.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All Status</option><option>Active</option><option>Stopped</option></select><input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)}/></div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Labour</th><th>Project</th><th>Wage/Day</th><th>Status</th><th>Paid</th><th>Stop / Joining</th><th>Action</th></tr></thead><tbody>{list.map(w=>{const paidW=expenses.filter(e=>String(e.workerId?._id||e.workerId)===String(w._id)&&e.type==='Labour Payment').reduce((a,e)=>a+Number(e.amount||0),0);return <tr key={w._id}><td><div className="worker-mini"><span className="avatar worker">{w.photoUrl?<img src={w.photoUrl} alt=""/>:initials(w.name)}</span><span><b>{w.name}</b><small>{w.role} - {w.mobile||'No mobile'}</small></span></div></td><td>{projects.find(p=>String(p._id)===String(w.projectId))?.name||'Unassigned'}</td><td>{money(w.wage)}</td><td><span className={`tag ${w.status==='Active'?'green':'red'}`}>{w.status}</span></td><td>{money(paidW)}</td><td><small>Join {fmtDate(w.joining)}</small>{w.stopDate&&<small className="danger">Stopped {fmtDate(w.stopDate)}</small>}</td><td><div className="row-actions"><button className="btn small green" onClick={()=>openModal({type:'expense',prefill:{workerId:w._id,type:'Labour Payment',paidTo:w.name,projectId:w.projectId}})}>Pay</button><button className="btn small light" onClick={()=>openModal({type:'ledger',item:w})}>Ledger</button><button className="btn small light" onClick={()=>openModal({type:'worker',item:w})}>Edit</button>{w.status==='Active'?<button className="btn small red" onClick={async()=>{try{await api(`/workers/${w._id}`,{method:'PATCH',body:JSON.stringify({status:'Stopped',stopDate:todayISO()})});toast('Labour stopped');await onRefresh()}catch(e){toast(e.message)}}}>Stop</button>:<button className="btn small primary" onClick={async()=>{try{await api(`/workers/${w._id}`,{method:'PATCH',body:JSON.stringify({status:'Active'})});toast('Labour resumed');await onRefresh()}catch(e){toast(e.message)}}}>Resume</button>}</div></td></tr>})}{!list.length&&<tr><td colSpan="7"><Empty/></td></tr>}</tbody></table></div>
    </div></div>
}


function ExpensesView({expenses,projects,workers,users,settings,onRefresh,openModal,toast}){
  const [q,setQ]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[project,setProject]=useState('all'),[category,setCategory]=useState('all'),[type,setType]=useState('all');
  const list=expenses.filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)&&(project==='all'||String(e.projectId?._id||e.projectId)===project)&&(category==='all'||e.category===category)&&(type==='all'||e.type===type)&&(!q||`${e.description} ${e.paidTo} ${e.projectId?.name||''} ${e.workerId?.name||''} ${e.category} ${e.type}`.toLowerCase().includes(q.toLowerCase())));
  const total=list.reduce((a,e)=>a+Number(e.amount||0),0), lab=list.filter(e=>e.type==='Labour Payment').reduce((a,e)=>a+Number(e.amount||0),0), mat=list.filter(e=>e.type==='Material Payment').reduce((a,e)=>a+Number(e.amount||0),0);
  function exportCsv(){const rows=[['Date','Added By','Project','Type','Category','Description','Paid To','Worker','Mode','Amount','Receipt','Note'],...list.map(e=>[e.date,e.userId?.name||'',e.projectId?.name||'',e.type,e.category,e.description,e.paidTo,e.workerId?.name||'',e.mode,e.amount,e.receiptNo,e.note])];downloadText(rows.map(r=>r.map(escCsv).join(',')).join('\n'),'zotrix_money_track.csv','text/csv');toast('CSV exported')}
  return <div><PageHead title="Daily Money & Expense Track" subtitle="Every money entry is tied to date, person, project and amount" actions={<><button className="btn green" onClick={()=>openModal({type:'expense',prefill:{type:'Labour Payment'}})}>+ Labour Payment</button><button className="btn gold" onClick={()=>openModal({type:'expense',prefill:null})}>+ Add Money / Expense</button></>}/>
    <div className="kpi-grid"><Kpi label="Filtered Money Out" value={money(total)} sub={`${list.length} entries`} className="accent-red"/><Kpi label="Labour Payments" value={money(lab)} sub="Current filter" className="accent-green"/><Kpi label="Material Payments" value={money(mat)} sub="Current filter" className="accent-blue"/><Kpi label="Average Entry" value={money(list.length?total/list.length:0)} sub="Per entry" className="accent-gold"/></div>
    <div className="card top-gap"><div className="filterbar"><input placeholder="Search person, description, vendor..." value={q} onChange={e=>setQ(e.target.value)}/><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/><input type="date" value={to} onChange={e=>setTo(e.target.value)}/><select value={project} onChange={e=>setProject(e.target.value)}><option value="all">All Projects</option>{projects.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select><select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All Categories</option>{(settings?.categories||[]).map(c=><option key={c}>{c}</option>)}</select><select value={type} onChange={e=>setType(e.target.value)}><option value="all">All Types</option>{(settings?.entryTypes||[]).map(c=><option key={c}>{c}</option>)}</select><button className="btn small light" onClick={exportCsv}>Export CSV</button></div>
      <div className="summary-strip"><Stat label="Selected Rows" value={list.length}/><Stat label="Total" value={money(total)}/><Stat label="Projects" value={new Set(list.map(x=>x.projectId?._id||x.projectId).filter(Boolean)).size}/><Stat label="People/Vendors" value={new Set(list.map(x=>x.paidTo).filter(Boolean)).size}/></div>
      <div className="table-wrap top-gap"><table className="table"><thead><tr><th>Date</th><th>Added By</th><th>Project</th><th>Type</th><th>Category</th><th>Description</th><th>Person/Vendor</th><th>Mode</th><th>Amount</th><th>Action</th></tr></thead><tbody>{list.map(e=><tr key={e._id}><td>{fmtDate(e.date)}</td><td>{e.userId?.name||'-'}</td><td>{e.projectId?.name||'-'}</td><td><span className="tag blue">{e.type}</span></td><td>{e.category}</td><td><b>{e.description}</b>{e.note&&<small>{e.note}</small>}</td><td>{e.paidTo||e.workerId?.name||'-'}</td><td>{e.mode}</td><td><strong>{money(e.amount)}</strong></td><td><div className="row-actions"><button className="btn small light" onClick={()=>openModal({type:'expense',item:e})}>Edit</button><button className="btn small red" onClick={async()=>{if(!confirm('Delete this money entry?'))return;try{await api(`/expenses/${e._id}`,{method:'DELETE'});toast('Entry deleted');await onRefresh()}catch(err){toast(err.message)}}}>Delete</button></div></td></tr>)||null}{!list.length&&<tr><td colSpan="10"><Empty/></td></tr>}</tbody></table></div>
    </div></div>
}
function Stat({label,value}){return <div className="summary-stat"><small>{label}</small><b>{value}</b></div>}

function adminScope(admin,projects,workers){
  if(!admin.accessControlEnabled) return {label:'Full workspace',detail:'All current data',tone:'green'};
  if(admin.allProjectAccess){return {label:'All projects',detail:`${workers.filter(worker=>worker.projectId).length} linked labour records`,tone:'blue'};}
  const assigned=(admin.projectAccess||[]).map(String); const linked=workers.filter(worker=>assigned.includes(String(worker.projectId))).length;
  return {label:`${assigned.length} project${assigned.length===1?'':'s'}`,detail:`${linked} linked labour records`,tone:assigned.length?'amber':'red'};
}
function MasterView({users,workers,settings,projects,onRefresh,openModal,toast}){
  const admins=users.filter(u=>u.role==='admin'), labourUsers=users.filter(u=>u.role==='labour');
  return <div><section className="master-welcome"><div><span className="eyebrow">Control center <i/> Owner access</span><h1>Master Administration</h1><p>Manage people, project visibility, company identity and operational data from one focused workspace.</p></div><span className="master-lock"><Icon name="shield"/> Master only</span></section>
    <div className="master-grid"><div className="summary-stat"><small>Administrators</small><b>{admins.length}</b><span>Access managed by you</span></div><div className="summary-stat"><small>Labour Accounts</small><b>{labourUsers.length}</b><span>Login-ready workers</span></div><div className="summary-stat"><small>Projects</small><b>{projects.length}</b><span>Portfolio records</span></div><div className="summary-stat"><small>Active Labour</small><b>{workers.filter(w=>w.status==='Active').length}</b><span>Working today</span></div></div>
    <div className="master-layout top-gap"><div className="card admin-management-card"><div className="section-title"><div><span className="eyebrow dark">People & permissions</span><h3>Administrator access</h3></div><button className="btn gold" onClick={()=>openModal({type:'user',role:'admin'})}><Icon name="plus"/> Add admin</button></div><p className="section-helper">Assign projects once. Linked labour, expenses, attendance and dashboard totals follow automatically.</p><div className="table-wrap"><table className="table admin-table"><thead><tr><th>Administrator</th><th>Access scope</th><th>Status</th><th>Action</th></tr></thead><tbody>{admins.map(admin=>{const scope=adminScope(admin,projects,workers);return <tr key={admin.id}><td><div className="admin-person"><span className="avatar">{initials(admin.name)}</span><span><b>{admin.name}</b><small>{admin.loginId} · {admin.jobRole||'Site Admin'}</small></span></div></td><td><span className={`tag ${scope.tone}`}>{scope.label}</span><small>{scope.detail}</small></td><td><span className={`tag ${admin.active?'green':'red'}`}>{admin.active?'Active':'Disabled'}</span></td><td><div className="row-actions"><button className="btn small light" onClick={()=>openModal({type:'user',item:admin,role:'admin'})}>Manage access</button><button className="btn small red" onClick={async()=>{if(!confirm(`Disable ${admin.name}?`))return;try{await api(`/auth/users/${admin.id}`,{method:'DELETE'});toast('Admin disabled');await onRefresh()}catch(e){toast(e.message)}}}>Disable</button></div></td></tr>})}{!admins.length&&<tr><td colSpan="4"><Empty/></td></tr>}</tbody></table></div></div>
      <div className="card quick-admin-card"><div className="section-title"><div><span className="eyebrow dark">Quick actions</span><h3>Workspace setup</h3></div><span className="tag blue">Ready</span></div><div className="quick-action-list"><button onClick={()=>openModal({type:'user',role:'admin'})}><span className="quick-icon gold"><Icon name="users"/></span><span><b>Invite administrator</b><small>Create a restricted project workspace</small></span><Icon name="chevron"/></button><button onClick={()=>openModal({type:'worker',item:null,allowLogin:true})}><span className="quick-icon green"><Icon name="plus"/></span><span><b>Add labour account</b><small>Create worker record and login access</small></span><Icon name="chevron"/></button><button onClick={()=>openModal({type:'password'})}><span className="quick-icon dark"><Icon name="shield"/></span><span><b>Secure account</b><small>Update your master password</small></span><Icon name="chevron"/></button></div></div></div>
    <div className="card top-gap"><SectionTitle title="Labour Login Accounts" badge="Master controlled"/><div className="table-wrap"><table className="table"><thead><tr><th>Worker</th><th>Login ID</th><th>Status</th><th>Action</th></tr></thead><tbody>{labourUsers.map(account=>{const worker=workers.find(x=>String(x._id)===String(account.workerId));return <tr key={account.id}><td><div className="admin-person"><span className="avatar worker">{initials(worker?.name||account.name)}</span><span><b>{worker?.name||account.name}</b><small>{worker?.role||account.jobRole||'Labour'}</small></span></div></td><td><code>{account.loginId}</code></td><td><span className={`tag ${account.active?'green':'red'}`}>{account.active?'Active':'Disabled'}</span></td><td><button className="btn small light" onClick={()=>worker&&openModal({type:'worker',item:worker,allowLogin:true})}>Manage</button></td></tr>})}{!labourUsers.length&&<tr><td colSpan="4"><Empty/></td></tr>}</tbody></table></div></div>
    <div className="card top-gap"><SectionTitle title="Company Branding" badge="Master only"/><BrandingForm settings={settings} onSave={async(data)=>{try{await api('/settings',{method:'PATCH',body:JSON.stringify(data)});toast('Branding saved');await onRefresh()}catch(e){toast(e.message)}}}/></div>
    <div className="card top-gap"><SectionTitle title="Data Migration" badge="Legacy JSON"/><p className="muted">Import the JSON backup exported from your old single-file Zotrix Research Private Ltd application. Existing passwords are deliberately not imported; labour accounts receive new temporary passwords.</p><button className="btn primary" onClick={()=>openModal({type:'migration'})}>Import Old Zotrix Research Private Ltd Backup</button></div>
    <div className="card top-gap"><SectionTitle title="Master Password" badge="Security"/><button className="btn light" onClick={()=>openModal({type:'password'})}>Change Password</button></div>
  </div>
}function BrandingForm({settings,onSave}){
  const [name,setName]=useState(settings?.businessName||'Zotrix Research Private Ltd');
  const [selectedLogo,setSelectedLogo]=useState(settings?.logoUrl||LOGO_SRC);
  const [customLogo,setCustomLogo]=useState(false);
  const [crop,setCrop]=useState({zoom:1,x:0,y:0});
  const [busy,setBusy]=useState(false);
  const dragRef=useRef(null);
  function selectLogo(event){
    const file=event.target.files?.[0];
    if(!file||!file.type.startsWith('image/')||file.size>4*1024*1024)return;
    const reader=new FileReader();
    reader.onload=()=>{setSelectedLogo(String(reader.result||''));setCustomLogo(true);setCrop({zoom:1,x:0,y:0})};
    reader.readAsDataURL(file);
  }
  function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
  function startDrag(event){
    if(!customLogo)return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:crop.x,y:crop.y};
  }
  function moveDrag(event){
    const drag=dragRef.current;
    if(!drag||drag.pointerId!==event.pointerId)return;
    setCrop(current=>({...current,x:clamp(drag.x+(event.clientX-drag.startX)/2,-50,50),y:clamp(drag.y+(event.clientY-drag.startY)/2,-50,50)}));
  }
  function stopDrag(){dragRef.current=null}
  function setZoom(value){setCrop(current=>({...current,zoom:clamp(Number(value),1,2.5)}))}
  function cropLogo(){
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>{
        const size=512, canvas=document.createElement('canvas');
        canvas.width=size; canvas.height=size;
        const context=canvas.getContext('2d');
        const scale=Math.max(size/image.naturalWidth,size/image.naturalHeight)*crop.zoom;
        const width=image.naturalWidth*scale, height=image.naturalHeight*scale;
        context.save();
        context.beginPath();
        context.arc(size/2,size/2,size/2,0,Math.PI*2);
        context.clip();
        context.drawImage(image,(size-width)/2+crop.x*2,(size-height)/2+crop.y*2,width,height);
        context.restore();
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror=reject;
      image.src=selectedLogo;
    });
  }
  async function save(){
    setBusy(true);
    try{
      const logoUrl=customLogo?await cropLogo():settings?.logoUrl||'';
      await onSave({businessName:name,logoUrl});
    }finally{setBusy(false)}
  }
  function resetCrop(){setCrop({zoom:1,x:0,y:0})}
  return <div className="branding-editor"><div className="crop-stage-wrap"><div className="logo-crop-preview round" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}><img src={selectedLogo} alt="Logo preview" style={{transform:`scale(${crop.zoom}) translate(${crop.x/2}px,${crop.y/2}px)`}}/><span className="crop-hint">Drag to position</span></div><div className="crop-toolbar"><button type="button" className="crop-control" onClick={()=>setZoom(crop.zoom-0.1)} aria-label="Zoom out">-</button><span>{Math.round(crop.zoom*100)}%</span><button type="button" className="crop-control" onClick={()=>setZoom(crop.zoom+0.1)} aria-label="Zoom in">+</button></div></div><div className="branding-controls"><div className="field"><label>Company Name</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Upload Logo</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectLogo}/><small className="muted">Upload up to 4 MB. Drag the logo inside the circle and use zoom controls.</small></div>{customLogo&&<div className="crop-settings"><div className="crop-setting-head"><b>Logo framing</b><button type="button" className="crop-reset" onClick={resetCrop}>Reset crop</button></div><div className="zoom-row"><button type="button" className="crop-control" onClick={()=>setZoom(crop.zoom-0.1)}>-</button><input aria-label="Logo zoom" type="range" min="1" max="2.5" step="0.05" value={crop.zoom} onChange={e=>setZoom(e.target.value)}/><button type="button" className="crop-control" onClick={()=>setZoom(crop.zoom+0.1)}>+</button></div><div className="zoom-labels"><span>Fit</span><b>{Math.round(crop.zoom*100)}%</b><span>Zoom</span></div></div>}<div className="branding-actions"><button type="button" className="btn light" onClick={()=>{setSelectedLogo(LOGO_SRC);setCustomLogo(false);resetCrop()}}>Use Default Logo</button><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy?'Saving...':'Save Branding'}</button></div></div></div>
}

function ModalHost({modal,close,setModal,user,settings,projects,workers,users,refreshAll,refreshWorkers,refreshExpenses,refreshProjects,toast}){
  if(modal.type==='project') return <ProjectModal item={modal.item} close={close} onSaved={async()=>{await refreshProjects();await refreshAll();close()}} toast={toast}/>;
  if(modal.type==='worker') return <WorkerModal item={modal.item} allowLogin={modal.allowLogin||false} user={user} projects={projects} close={close} onSaved={async(result)=>{await refreshWorkers();await refreshAll();if(result?.credentials)setModal({type:'credentials',credentials:result.credentials});else close()}} toast={toast}/>;
  if(modal.type==='expense') return <ExpenseModal item={modal.item} prefill={modal.prefill} projects={projects} workers={workers} settings={settings} close={close} onSaved={async()=>{await refreshExpenses();await refreshAll();close()}} toast={toast}/>;
  if(modal.type==='attendance') return <AttendanceModal date={modal.date||todayISO()} workers={workers} projects={projects} close={close} onSaved={async()=>{await refreshWorkers();await refreshAll();close()}} toast={toast}/>;
  if(modal.type==='ledger') return <LedgerModal worker={modal.item} close={close} toast={toast}/>;
  if(modal.type==='user') return <UserModal item={modal.item} role={modal.role||'admin'} settings={settings} projects={projects} workers={workers} close={close} onSaved={async()=>{await refreshAll();close()}} toast={toast}/>;
  if(modal.type==='credentials') return <CredentialsModal credentials={modal.credentials} close={close}/>;
  if(modal.type==='profile') return <ProfileModal user={user} close={close} onSaved={async()=>{window.location.reload()}} toast={toast}/>;
  if(modal.type==='password') return <PasswordModal close={close} toast={toast}/>;
  if(modal.type==='migration') return <MigrationModal close={close} toast={toast} onDone={refreshAll}/>;
  return null;
}

function Modal({title,children,close,wide=false}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className={`modal-card ${wide?'wide':''}`}><div className="modal-head"><h3>{title}</h3><button className="close-btn" onClick={close}>-</button></div><div className="modal-body">{children}</div></div></div>}

function ProjectModal({item,close,onSaved,toast}){const p=item||{};const [f,setF]=useState({name:p.name||'',code:p.code||'',client:p.client||'',location:p.location||'',budget:p.budget??0,progress:p.progress??0,start:p.start||todayISO(),end:p.end||'',status:p.status||'Active'});const set=(k,v)=>setF(x=>({...x,[k]:v}));async function save(){try{await api(item?`/projects/${item._id}`:'/projects',{method:item?'PATCH':'POST',body:JSON.stringify(f)});toast(item?'Project updated':'Project added');await onSaved()}catch(e){toast(e.message)}}return <Modal title={item?'Edit Project':'Add Ongoing Project'} close={close}><div className="form-grid">{[['name','Project Name','text'],['code','Project Code','text'],['client','Client / Department','text'],['location','Location','text'],['budget','Budget','number'],['progress','Progress %','number'],['start','Start Date','date'],['end','Expected End','date']].map(([k,l,t])=><div className="field" key={k}><label>{l}</label><input type={t} value={f[k]} onChange={e=>set(k,e.target.value)} min={k==='progress'?0:undefined} max={k==='progress'?100:undefined}/></div>)}<div className="field"><label>Status</label><select value={f.status} onChange={e=>set('status',e.target.value)}><option>Active</option><option>Planning</option><option>Hold</option><option>Completed</option></select></div></div><FormActions close={close} save={save} label={item?'Save Project':'Add Project'}/></Modal>}

function WorkerModal({item,allowLogin,user,projects,close,onSaved,toast}){
  const worker=item||{};
  const canManageLogin=user.role==='master'&&allowLogin;
  const [createLogin,setCreateLogin]=useState(!item);
  const [form,setForm]=useState({name:worker.name||'',role:worker.role||'Labour',mobile:worker.mobile||'',wage:worker.wage??0,otRate:worker.otRate??0,joining:worker.joining||todayISO(),projectId:worker.projectId?._id||worker.projectId||'',status:worker.status||'Active',stopDate:worker.stopDate||'',stopReason:worker.stopReason||'',bankName:worker.bankName||'',accountHolder:worker.accountHolder||'',accountNo:worker.accountNo||'',ifsc:worker.ifsc||'',upiId:worker.upiId||'',photoUrl:worker.photoUrl||''});
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  async function save(){
    try{
      const result=await api(item?`/workers/${item._id}`:'/workers',{method:item?'PATCH':'POST',body:JSON.stringify({...form,createLogin:canManageLogin&&createLogin})});
      toast(item?'Labour updated':'Labour added');
      await onSaved(result);
    }catch(error){toast(error.message)}
  }
  return <Modal title={item?'Edit Labour':'Add Labour'} close={close} wide><div className="form-grid">
    {[['name','Full Name','text'],['role','Role / Category','text'],['mobile','Mobile','tel'],['wage','Wage / Day','number'],['otRate','OT Rate / Hour','number'],['joining','Joining Date','date']].map(([key,label,type])=><div className="field" key={key}><label>{label}</label><input type={type} value={form[key]} onChange={event=>set(key,event.target.value)}/></div>)}
    <div className="field"><label>Project</label><select value={form.projectId} onChange={event=>set('projectId',event.target.value)}><option value="">- Unassigned -</option>{projects.map(project=><option key={project._id} value={project._id}>{project.name}</option>)}</select></div>
    <div className="field"><label>Status</label><select value={form.status} onChange={event=>set('status',event.target.value)}><option>Active</option><option>Stopped</option></select></div>
    {[['stopDate','Stop Date','date'],['stopReason','Stop Reason','text'],['bankName','Bank Name','text'],['accountHolder','Account Holder','text'],['accountNo','Account Number','text'],['ifsc','IFSC','text'],['upiId','UPI ID','text'],['photoUrl','Photo URL','url']].map(([key,label,type])=><div className="field" key={key}><label>{label}</label><input type={type} value={form[key]} onChange={event=>set(key,event.target.value)}/></div>)}
    {canManageLogin&&<><div className="form-divider"><span>Labour Login Account</span></div><label className="field form-full"><span>{item?'Generate a new password or create an account':'Generate login credentials automatically'}</span><input type="checkbox" checked={createLogin} onChange={event=>setCreateLogin(event.target.checked)}/></label></>}
  </div><FormActions close={close} save={save} label={item?'Save Labour':'Add Labour'}/></Modal>;
}

function ExpenseModal({item,prefill,projects,workers,settings,close,onSaved,toast}){const e=item||{};const [f,setF]=useState({date:e.date||todayISO(),projectId:e.projectId?._id||e.projectId||prefill?.projectId||'',type:e.type||prefill?.type||'Work Expense',category:e.category||'Labour',workerId:e.workerId?._id||e.workerId||prefill?.workerId||'',amount:e.amount??0,paidTo:e.paidTo||prefill?.paidTo||'',description:e.description||'',mode:e.mode||'Cash',receiptNo:e.receiptNo||'',note:e.note||''});const set=(k,v)=>setF(x=>({...x,[k]:v}));async function save(){try{await api(item?`/expenses/${item._id}`:'/expenses',{method:item?'PATCH':'POST',body:JSON.stringify(f)});toast(item?'Entry updated':'Money entry added');await onSaved()}catch(err){toast(err.message)}}useEffect(()=>{if(f.workerId&&!f.paidTo){const w=workers.find(x=>String(x._id)===String(f.workerId));if(w)setF(x=>({...x,paidTo:w.name,projectId:x.projectId||w.projectId||''}))}},[f.workerId,workers]);return <Modal title={item?'Edit Money Entry':'Add Money / Expense'} close={close} wide><div className="form-grid"><div className="field"><label>Date</label><input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></div><div className="field"><label>Project</label><select value={f.projectId} onChange={e=>set('projectId',e.target.value)}><option value="">- Unassigned -</option>{projects.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select></div><div className="field"><label>Type</label><select value={f.type} onChange={e=>set('type',e.target.value)}>{(settings?.entryTypes||[]).map(t=><option key={t}>{t}</option>)}</select></div><div className="field"><label>Category</label><select value={f.category} onChange={e=>set('category',e.target.value)}>{(settings?.categories||[]).map(c=><option key={c}>{c}</option>)}</select></div><div className="field"><label>Worker (optional)</label><select value={f.workerId} onChange={e=>set('workerId',e.target.value)}><option value="">- Not linked -</option>{workers.map(w=><option key={w._id} value={w._id}>{w.name}{w.status==='Stopped'?' - Stopped':''}</option>)}</select></div><div className="field"><label>Amount</label><input type="number" min="0" step="0.01" value={f.amount} onChange={e=>set('amount',e.target.value)}/></div><div className="field"><label>Paid To / Person</label><input value={f.paidTo} onChange={e=>set('paidTo',e.target.value)}/></div><div className="field"><label>Payment Mode</label><select value={f.mode} onChange={e=>set('mode',e.target.value)}>{(settings?.modes||[]).map(m=><option key={m}>{m}</option>)}</select></div><div className="field form-full"><label>Description</label><textarea value={f.description} onChange={e=>set('description',e.target.value)} placeholder="What was this money for?"/></div><div className="field"><label>Receipt / Reference</label><input value={f.receiptNo} onChange={e=>set('receiptNo',e.target.value)}/></div><div className="field"><label>Note</label><input value={f.note} onChange={e=>set('note',e.target.value)}/></div></div><FormActions close={close} save={save} label={item?'Save Entry':'Add Money Entry'}/></Modal>}

function AttendanceModal({date,workers,projects,close,onSaved,toast}){const [rows,setRows]=useState([]),[busy,setBusy]=useState(false);useEffect(()=>{(async()=>{try{const d=await api(`/attendance?date=${encodeURIComponent(date)}`);const map=new Map((d.records||[]).map(r=>[String(r.workerId?._id||r.workerId),r]));setRows(workers.filter(w=>w.status!=='Deleted').map(w=>{const r=map.get(String(w._id));const eligible=(!w.joining||date>=w.joining)&&(!w.stopDate||date<=w.stopDate);return {workerId:w._id,name:w.name,role:w.role,status:r?.status||(date===todayISO()&&w.status==='Active'&&eligible?'P':'-'),otHours:r?.otHours||0,lateMinutes:r?.lateMinutes||0,auto:!r&&date===todayISO()&&w.status==='Active'&&eligible}}))}catch(e){toast(e.message)}})()},[date,workers]);const set=(id,k,v)=>setRows(rs=>rs.map(r=>String(r.workerId)===String(id)?({...r,[k]:v,auto:false}):r));async function save(){setBusy(true);try{await api('/attendance/bulk',{method:'POST',body:JSON.stringify({date,records:rows.filter(r=>r.status!=='-').map(r=>({workerId:r.workerId,status:r.status,otHours:Number(r.otHours||0),lateMinutes:Number(r.lateMinutes||0)}))})});toast('Attendance saved');await onSaved()}catch(e){toast(e.message)}finally{setBusy(false)}}return <Modal title={`Attendance - ${fmtDate(date)}`} close={close} wide><div className="attendance-note">Present is the default for an eligible active worker on today-s sheet. Saving a row stores an explicit record.</div><div className="attendance-sheet">{rows.map(r=><div className="att-row" key={r.workerId}><div><b>{r.name}</b><small>{r.role}</small></div><div className="status-buttons"><button className={r.status==='P'?'selected p':''} onClick={()=>set(r.workerId,'status','P')}>P</button><button className={r.status==='H'?'selected h':''} onClick={()=>set(r.workerId,'status','H')}>H</button><button className={r.status==='A'?'selected a':''} onClick={()=>set(r.workerId,'status','A')}>A</button></div><div className="field-mini"><label>OT h</label><input type="number" min="0" step="0.5" value={r.otHours} onChange={e=>set(r.workerId,'otHours',e.target.value)}/></div><div className="field-mini"><label>Late min</label><input type="number" min="0" value={r.lateMinutes} onChange={e=>set(r.workerId,'lateMinutes',e.target.value)}/></div><div><span className={`tag ${r.status==='P'?'green':r.status==='H'?'amber':r.status==='A'?'red':'light'}`}>{statusText[r.status]}{r.auto?' - AUTO':''}</span></div></div>)}</div><div className="form-actions"><button className="btn light" onClick={close}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy?'Saving-':'Save Attendance'}</button></div></Modal>}

function LedgerModal({worker,close,toast}){const [data,setData]=useState(null),[month,setMonth]=useState(new Date(`${todayISO()}T12:00:00`));useEffect(()=>{api(`/workers/${worker._id}/ledger`).then(setData).catch(e=>toast(e.message))},[worker]);const records=data?.attendance||[];const payments=data?.payments||[];const year=month.getFullYear(),mon=month.getMonth(),days=new Date(year,mon+1,0).getDate();const attMap=new Map(records.map(r=>[r.date,r]));const first=new Date(year,mon,1).getDay();const mondayStart=(first+6)%7;return <Modal title={`${worker.name} - Worker Ledger`} close={close} wide><div className="report-grid"><Stat label="Wage/Day" value={money(worker.wage)}/><Stat label="Joining" value={fmtDate(worker.joining)}/><Stat label="Status" value={worker.status}/><Stat label="Payments" value={payments.length}/></div><div className="ledger-calendar top-gap"><div className="calendar-head"><button className="btn small light" onClick={()=>setMonth(new Date(year,mon-1,1))}>-</button><b>{indiaMonthFormatter.format(month)}</b><button className="btn small light" onClick={()=>setMonth(new Date(year,mon+1,1))}>-</button></div><div className="calendar-week">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=><span key={x}>{x}</span>)}</div><div className="calendar-grid">{Array.from({length:mondayStart}).map((_,i)=><div key={`b${i}`} className="day blank"/>)}{Array.from({length:days}).map((_,i)=>{const d=i+1;const date=`${year}-${String(mon+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const a=attMap.get(date);const s=a?.status||'-';return <div key={date} className={`day ${s==='P'?'p':s==='H'?'h':s==='A'?'a':''}`}><b>{d}</b><span>{statusText[s]}</span>{a?.otHours?<small>OT {a.otHours}h</small>:null}{a?.lateMinutes?<small>L {a.lateMinutes}</small>:null}</div>})}</div></div><div className="table-wrap top-gap"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Mode</th><th>Amount</th></tr></thead><tbody>{payments.slice(0,50).map(p=><tr key={p._id}><td>{fmtDate(p.date)}</td><td>{p.type}</td><td>{p.description}</td><td>{p.mode}</td><td><b>{money(p.amount)}</b></td></tr>)}</tbody></table></div><div className="row-actions top-gap"><button className="btn light" onClick={()=>{const rows=[['Date','Status','OT Hours','Late Minutes'],...records.map(r=>[r.date,r.status,r.otHours,r.lateMinutes]),[],['Payment Date','Type','Description','Mode','Amount'],...payments.map(p=>[p.date,p.type,p.description,p.mode,p.amount])];downloadText(rows.map(r=>r.map(escCsv).join(',')).join('\n'),`zotrix_${worker.name.replace(/[^a-z0-9]+/gi,'_')}_ledger.csv`,'text/csv');toast('Worker ledger exported')}}>Export Ledger CSV</button></div></Modal>}

function UserModal({item,role,settings,projects=[],workers=[],close,onSaved,toast}){
  const account=item||{};
  const [form,setForm]=useState({name:account.name||'',loginId:account.loginId||'',mobile:account.mobile||'',email:account.email||'',jobRole:account.jobRole||'Site Admin',password:''});
  const initialCategories=account.accountingCategories||['*'];
  const [fullAccounting,setFullAccounting]=useState(initialCategories.includes('*'));
  const [accountingCategories,setAccountingCategories]=useState(initialCategories.includes('*')?[]:initialCategories);
  const [restrictedAccess,setRestrictedAccess]=useState(role==='admin' ? (item ? account.accessControlEnabled===true : true) : false);
  const [allProjectAccess,setAllProjectAccess]=useState(account.allProjectAccess===true);
  const [projectAccess,setProjectAccess]=useState((account.projectAccess||[]).map(String));
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  const toggleProject=(id)=>setProjectAccess(current=>current.includes(String(id))?current.filter(value=>value!==String(id)):[...current,String(id)]);
  const linkedLabourCount=allProjectAccess?workers.filter(worker=>worker.projectId).length:workers.filter(worker=>projectAccess.includes(String(worker.projectId))).length;
  async function save(){
    try{
      const permissions=role==='admin'?{
        accessControlEnabled:restrictedAccess,
        allProjectAccess:restrictedAccess&&allProjectAccess,
        projectAccess:restrictedAccess&&!allProjectAccess?projectAccess:[],
        allWorkerAccess:false,
        workerAccess:[],
        unassignedExpenseAccess:false,
        accountingCategories:fullAccounting?['*']:accountingCategories
      }:{};
      await api(item?`/auth/users/${item.id}`:'/auth/users',{method:item?'PATCH':'POST',body:JSON.stringify({role,...form,...permissions})});
      toast(item?'Account updated':'Account created');
      await onSaved();
    }catch(error){toast(error.message)}
  }
  return <Modal title={`${item?'Edit':'Add'} ${role==='labour'?'Labour Account':'Administrator'}`} close={close}><div className="form-grid">
    <div className="field"><label>Full Name</label><input value={form.name} onChange={event=>set('name',event.target.value)}/></div>
    <div className="field"><label>User ID</label><input value={form.loginId} onChange={event=>set('loginId',event.target.value.toUpperCase())}/></div>
    <div className="field"><label>Mobile</label><input value={form.mobile} onChange={event=>set('mobile',event.target.value)}/></div>
    <div className="field"><label>Email</label><input type="email" value={form.email} onChange={event=>set('email',event.target.value)}/></div>
    <div className="field form-full"><label>Role / Job</label><input value={form.jobRole} onChange={event=>set('jobRole',event.target.value)}/></div>
    <div className="field form-full"><label>{item?'New Password (optional)':'Password'}</label><input type="password" value={form.password} onChange={event=>set('password',event.target.value)} placeholder="Minimum 8 characters"/></div>
    {role==='admin'&&<>
      <div className="form-divider"><span>Workspace access</span></div>
      <label className="permission-option form-full"><input type="checkbox" checked={restrictedAccess} onChange={event=>setRestrictedAccess(event.target.checked)}/><span><b>Restrict this admin to assigned projects</b><small>Only assigned projects and their linked labour, expenses, attendance and dashboard data will be visible.</small></span></label>
      {restrictedAccess&&<>
        <div className="permission-block form-full"><div className="permission-head"><b>Project access</b><small>Select one or more projects.</small></div><label className="permission-option"><input type="checkbox" checked={allProjectAccess} onChange={event=>setAllProjectAccess(event.target.checked)}/><span>All projects</span></label>{!allProjectAccess&&<div className="permission-list">{projects.map(project=><label className="permission-option" key={project._id}><input type="checkbox" checked={projectAccess.includes(String(project._id))} onChange={()=>toggleProject(project._id)}/><span>{project.name}<small>{project.code||project.location||'Project'}</small></span></label>)}{!projects.length&&<small className="muted">No projects created yet.</small>}</div>}</div>
        <div className="access-preview form-full"><div><span>Linked labour</span><b>{linkedLabourCount}</b></div><div><span>Expense scope</span><b>{allProjectAccess?'All project expenses':`${projectAccess.length} project${projectAccess.length===1?'':'s'}`}</b></div><small>Labour and expense access follows the selected project automatically.</small></div>
      </>}
      <div className="form-divider"><span>Accounting visibility</span></div><label className="permission-option form-full"><input type="checkbox" checked={fullAccounting} onChange={event=>setFullAccounting(event.target.checked)}/><span><b>All accounting categories</b><small>Turn off to choose categories below.</small></span></label>{!fullAccounting&&(settings?.categories||[]).map(category=><label className="permission-option" key={category}><input type="checkbox" checked={accountingCategories.includes(category)} onChange={event=>setAccountingCategories(current=>event.target.checked?[...current,category]:current.filter(value=>value!==category))}/><span>{category}</span></label>)}
    </>}
  </div><FormActions close={close} save={save} label={item?'Save Account':'Create Account'}/></Modal>;
}
function ProfileModal({user,close,onSaved,toast}){
  const [form,setForm]=useState({name:user.name||'',mobile:user.mobile||'',email:user.email||'',jobRole:user.jobRole||'',photoUrl:user.photoUrl||''});
  const set=(key,value)=>setForm(current=>({...current,[key]:value}));
  async function selectPhoto(event){
    const file=event.target.files?.[0];
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))return toast('Choose a JPG, PNG, WebP or GIF image');
    if(file.size>2*1024*1024)return toast('Profile photo must be smaller than 2 MB');
    const reader=new FileReader();
    reader.onload=()=>set('photoUrl',String(reader.result||''));
    reader.onerror=()=>toast('Unable to read this image');
    reader.readAsDataURL(file);
  }
  async function save(){try{await api('/auth/me',{method:'PATCH',body:JSON.stringify(form)});toast('Profile saved');await onSaved()}catch(error){toast(error.message)}}
  return <Modal title="My Profile" close={close}><div className="profile-card"><div className="avatar xl">{form.photoUrl?<img src={form.photoUrl} alt=""/>:initials(form.name)}</div><div><h3>{form.name}</h3><p>{user.role}</p></div></div>
    <div className="form-grid top-gap"><div className="field"><label>Name</label><input value={form.name} onChange={event=>set('name',event.target.value)}/></div><div className="field"><label>Mobile</label><input value={form.mobile} onChange={event=>set('mobile',event.target.value)}/></div><div className="field"><label>Email</label><input value={form.email} onChange={event=>set('email',event.target.value)}/></div><div className="field"><label>Job Role</label><input value={form.jobRole} onChange={event=>set('jobRole',event.target.value)}/></div>
      <div className="field form-full"><label>Profile photo</label><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={selectPhoto}/>{form.photoUrl&&<button type="button" className="btn small light top-gap" onClick={()=>set('photoUrl','')}>Remove photo</button>}</div>
    </div><FormActions close={close} save={save} label="Save Profile"/></Modal>;
}

function CredentialsModal({credentials,close}){return <Modal title="Labour Login Created" close={close}><p className="muted">Share these credentials with {credentials.name}. The password is shown only now.</p><div className="credential"><b>User ID</b><code>{credentials.loginId}</code><b>Temporary password</b><code>{credentials.password}</code></div><FormActions close={close} save={()=>navigator.clipboard?.writeText(`User ID: ${credentials.loginId}\nPassword: ${credentials.password}`)} label="Copy Credentials"/></Modal>}
function PasswordModal({close,toast}){const [p,setP]=useState(''),[p2,setP2]=useState('');async function save(){if(p.length<8)return toast('Use at least 8 characters');if(p!==p2)return toast('Passwords do not match');try{await api('/auth/change-password',{method:'POST',body:JSON.stringify({password:p})});toast('Password changed');close()}catch(e){toast(e.message)}}return <Modal title="Change Password" close={close}><div className="form-grid"><div className="field form-full"><label>New Password</label><input type="password" value={p} onChange={e=>setP(e.target.value)}/></div><div className="field form-full"><label>Confirm Password</label><input type="password" value={p2} onChange={e=>setP2(e.target.value)}/></div></div><FormActions close={close} save={save} label="Change Password"/></Modal>}
function MigrationModal({close,toast,onDone}){const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[result,setResult]=useState(null);async function importIt(){if(!file)return;setBusy(true);try{const text=await file.text();const data=JSON.parse(text);const r=await api('/migration/import',{method:'POST',body:JSON.stringify({data})});setResult(r);toast('Migration completed');await onDone()}catch(e){toast(e.message)}finally{setBusy(false)}}return <Modal title="Import Old Zotrix Research Private Ltd Backup" close={close} wide><div className="migration-note"><b>Important:</b> old plaintext passwords are not carried into MongoDB. The migration creates fresh labour login passwords and shows them once after import.</div><div className="field"><label>Select old JSON backup</label><input type="file" accept="application/json,.json" onChange={e=>setFile(e.target.files?.[0]||null)}/></div><div className="form-actions"><button className="btn light" onClick={close}>Cancel</button><button className="btn primary" disabled={!file||busy} onClick={importIt}>{busy?'Importing-':'Import Data'}</button></div>{result&&<div className="migration-result top-gap"><h4>Migration complete</h4><p>{result.message}</p><pre>{JSON.stringify(result.imported,null,2)}</pre>{result.generatedCredentials?.length>0&&<><h4>New Labour Credentials - save these now</h4>{result.generatedCredentials.map(x=><div className="credential" key={x.loginId}><b>{x.name}</b><span>{x.loginId}</span><code>{x.password}</code></div>)}</>}</div>}</Modal>}

function FormActions({close,save,label}){return <div className="form-actions"><button className="btn light" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>{label}</button></div>}
function SectionTitle({title,badge}){return <div className="section-title"><h3>{title}</h3>{badge&&<span className="tag blue">{badge}</span>}</div>}
function Empty({text='No records found.'}){return <div className="empty">{text}</div>}
function SectionLoader(){return <div className="card loader-box">Loading dashboard-</div>}

export default App;
