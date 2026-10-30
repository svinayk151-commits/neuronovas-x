import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowRight, Bell, CheckCircle2, Clock3, HeartHandshake, Leaf, MapPin, Search, ShieldCheck, Utensils, X } from 'lucide-react'
import { listingsApi, notificationsApi, reportsApi, requestsApi, usersApi } from './api'
import { AuthProvider, useAuth } from './context/AuthContext'
import './App.css'

const categories = [
  ['cooked_meal', 'Cooked meal'], ['bakery', 'Bakery'], ['produce', 'Produce'],
  ['packaged', 'Packaged'], ['dairy', 'Dairy'], ['beverages', 'Beverages'],
]
const dietaryTags = ['veg', 'non-veg', 'vegan', 'contains nuts', 'gluten-free', 'halal']
const safetyText = 'This platform is a coordination tool, not a food-safety certification system. Donors are responsible for accurate handling and time information and compliance with local food-safety laws. Recipients should inspect food and follow their own safety procedures. We do not monitor temperatures or verify credentials. Demo data only; do not enter real personal information.'

function categoryName(value) {
  return categories.find(([key]) => key === value)?.[1] || value?.replaceAll('_', ' ') || 'Food'
}

function pretty(value) {
  return value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '—'
}

function dateTime(value) {
  if (!value) return '—'
  return parseDateTime(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function parseDateTime(value) {
  const normalized = value?.includes(' ') && !value.endsWith('Z') ? `${value.replace(' ', 'T')}Z` : value
  return new Date(normalized)
}

function dateTimeField(value) {
  if (!value) return ''
  const date = parseDateTime(value)
  const part = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`
}

function leftTime(value) {
  const ms = parseDateTime(value).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'Pickup deadline passed'
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  return hours ? `${hours}h ${minutes}m left` : `${minutes}m left`
}

function Countdown({ value }) {
  const [, refresh] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => refresh((current) => current + 1), 60_000)
    return () => clearInterval(timer)
  }, [])
  return <>{leftTime(value)}</>
}

function statusClass(status) {
  return `status status-${status || 'unknown'}`
}

function SafetyFooter() {
  return <footer className="disclaimer-footer">{safetyText} <Link to="/safety">Read full limitations</Link></footer>
}

function Header() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const navigate = useNavigate()
  useEffect(() => {
    if (user) notificationsApi.list().then(({ data }) => setItems(data.notifications)).catch((error) => toast.error(error.response?.data?.error || 'Could not load notifications'))
  }, [user])
  async function markRead(item) {
    await notificationsApi.markRead(item.id)
    setItems((current) => current.map((notice) => notice.id === item.id ? { ...notice, is_read: 1 } : notice))
    if (item.link) navigate(item.link)
  }
  return (
    <>
      <div className="demo-banner"><span>DEMO DATA</span> Fictional listings and profiles only · Please don’t enter real personal information</div>
      <header className="site-header">
        <Link className="brand" to="/"><span className="brand-icon"><Leaf size={19} /></span><span>Good<span className="brand-accent">Plate</span><small>Food, shared thoughtfully</small></span></Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link to="/browse">Find food</Link>
          {user && <Link to="/dashboard">Dashboard</Link>}
          {user && <Link to="/profile">Profile</Link>}
          {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
          <Link to="/safety">Food safety</Link>
        </nav>
        <div className="header-actions">
          {user && <div className="notice-wrap">
            <button className="icon-btn" aria-label="Notifications" onClick={() => setOpen(!open)}><Bell size={18} />{items.some((item) => !item.is_read) && <i />}</button>
            {open && <div className="notice-popover"><div className="popover-head">Notifications <button onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button></div>{items.length ? items.slice(0, 7).map((item) => <button className={`notice-item ${item.is_read ? '' : 'unread'}`} key={item.id} onClick={() => markRead(item)}>{item.message}<small>{dateTime(item.created_at)}</small></button>) : <p className="empty-mini">You’re all caught up.</p>}</div>}
          </div>}
          {user ? <><span className="user-chip">{user.profile?.business_name || user.profile?.org_name || user.email}</span><button className="btn btn-quiet" onClick={async () => { await logout(); toast.success('Signed out'); navigate('/') }}>Sign out</button></> : <><Link className="btn btn-quiet" to="/login">Log in</Link><Link className="btn btn-primary" to="/register">Join the network <ArrowRight size={15} /></Link></>}
        </div>
      </header>
    </>
  )
}

function Protected({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="section"><div className="loading">Loading your workspace…</div></main>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}

function PageShell({ children, className = '' }) {
  return <main className={`section ${className}`}>{children}</main>
}

function ListingCard({ listing }) {
  const profile = listing.donor_profile || {}
  return <article className="listing-card">
    <div className="listing-photo"><span className="food-icon"><Utensils size={23} /></span><span className="category-pill">{categoryName(listing.category)}</span></div>
    <div className="listing-content">
      <div className="listing-meta"><span>{profile.business_name || 'Community donor'}</span><span className={statusClass(listing.status)}>{pretty(listing.status)}</span></div>
      <h3><Link to={`/listings/${listing.id}`}>{listing.title}</Link></h3>
      <p className="muted clamp">{listing.description || 'Fresh surplus food, ready to be shared.'}</p>
      <div className="listing-facts"><span><MapPin size={14} />{listing.pickup_address}</span><strong>{listing.quantity_remaining} {listing.unit} available</strong></div>
      <div className="deadline"><Clock3 size={15} /><span>Pickup by <b>{dateTime(listing.pickup_window_end)}</b></span><em><Countdown value={listing.pickup_window_end} /></em></div>
      <div className="tag-row">{(listing.dietary_tags || []).map((tag) => <span className="food-tag" key={tag}>{pretty(tag)}</span>)}</div>
      <Link className="card-link" to={`/listings/${listing.id}`}>View details <ArrowRight size={15} /></Link>
    </div>
  </article>
}

function Landing() {
  const [featured, setFeatured] = useState([])
  useEffect(() => { listingsApi.browse().then(({ data }) => setFeatured(data.listings.slice(0, 3))).catch((error) => toast.error(error.response?.data?.error || 'Could not load featured donations')) }, [])
  return <>
    <section className="hero-section">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" />LESS WASTE. MORE GOOD.</div>
        <h1>Good food deserves<br /><span>a second chance.</span></h1>
        <p>We connect local food businesses with community organizations, turning today’s surplus into someone’s nourishing meal.</p>
        <div className="hero-buttons"><Link className="btn btn-primary btn-large" to="/browse">Explore available food <ArrowRight size={17} /></Link><Link className="btn btn-outline btn-large" to="/register">I have food to share</Link></div>
        <div className="hero-trust"><span><CheckCircle2 size={16} />Simple local pickups</span><span><CheckCircle2 size={16} />Community-led</span></div>
      </div>
      <div className="hero-art" role="img" aria-label="Illustration of fresh food being shared"><div className="sun-shape" /><div className="food-bowl"><div className="bowl-leaf leaf-one" /><div className="bowl-leaf leaf-two" /><div className="bowl-tomato" /><div className="bowl-carrot" /><div className="bowl-body" /></div><div className="floating-note note-top"><HeartHandshake size={18} /><span><b>Food finds a home</b><small>One pickup at a time</small></span></div><div className="floating-note note-bottom"><span className="note-heart">♥</span><span><b>Good things grow</b><small>When we share</small></span></div><span className="sparkle sparkle-a">✳</span><span className="sparkle sparkle-b">✳</span></div>
    </section>
    <section className="impact-strip"><div><b>01</b><span>Donors list good surplus</span></div><ArrowRight size={17} /><div><b>02</b><span>Local organizations request</span></div><ArrowRight size={17} /><div><b>03</b><span>Food is picked up and shared</span></div></section>
    <PageShell className="featured-section"><div className="section-heading"><div><div className="eyebrow">AVAILABLE NEARBY</div><h2>A little good, ready today.</h2><p>Browse available donations and coordinate pickup directly.</p></div><Link className="text-link" to="/browse">See all listings <ArrowRight size={16} /></Link></div>
      <div className="listing-grid">{featured.length ? featured.map((listing) => <ListingCard key={listing.id} listing={listing} />) : <div className="empty-state">New donations are on their way. Check back soon.</div>}</div>
    </PageShell>
    <section className="join-band"><div className="join-icon"><HeartHandshake size={26} /></div><div><h2>There’s room for everyone at the table.</h2><p>Join as a food donor or a community organization and make local connections.</p></div><Link className="btn btn-primary" to="/register">Get started <ArrowRight size={16} /></Link></section>
  </>
}

function AuthPage({ register = false }) {
  const { login, register: signUp } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState('recipient')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', business_name: '', type: 'NGO', contact_name: '', org_name: '', reg_id: '', contact: '', phone: '', address: '', city: 'Hyderabad', service_area: '', people_served: '', dietary_needs: '' })
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (register) {
        const profile = role === 'donor'
          ? { business_name: form.business_name, type: form.type, contact_name: form.contact_name, phone: form.phone, address: form.address, city: form.city }
          : { org_name: form.org_name, type: form.type, reg_id: form.reg_id, contact: form.contact, phone: form.phone, address: form.address, service_area: form.service_area, people_served: form.people_served, dietary_needs: form.dietary_needs }
        await signUp({ email: form.email, password: form.password, role, profile })
        toast.success('Welcome to GoodPlate!')
      } else {
        await login(form.email, form.password)
        toast.success('Welcome back')
      }
      navigate('/dashboard')
    } catch (error) { toast.error(error.response?.data?.error || 'Could not complete sign in') }
    finally { setBusy(false) }
  }
  async function demo(email, password) {
    try { await login(email, password); toast.success('Demo account ready'); navigate('/dashboard') }
    catch (error) { toast.error(error.response?.data?.error || 'Demo sign in failed') }
  }
  return <PageShell className="auth-page"><div className="auth-aside"><div className="eyebrow">A COMMUNITY TABLE</div><h1>{register ? 'Let’s make room for more good.' : 'Welcome back to the table.'}</h1><p>{register ? 'A simple way to share surplus food and connect with organizations nearby.' : 'Pick up where your community left off.'}</p><div className="auth-aside-note"><ShieldCheck size={20} /><span><b>Demo environment</b><small>All listed names and contact details are fictional.</small></span></div></div>
    <div className="auth-card"><div className="auth-tabs"><Link className={!register ? 'selected' : ''} to="/login">Log in</Link><Link className={register ? 'selected' : ''} to="/register">Create account</Link></div><h2>{register ? 'Create your account' : 'Sign in'}</h2><p className="muted">{register ? 'Choose how you would like to take part.' : 'Use your email and password to continue.'}</p>
      <form className="form-stack" onSubmit={submit}>
        {register && <><label className="field-label">I’m joining as</label><div className="role-picker"><button type="button" className={role === 'recipient' ? 'active' : ''} onClick={() => { setRole('recipient'); set('type', 'NGO') }}>Recipient organization</button><button type="button" className={role === 'donor' ? 'active' : ''} onClick={() => { setRole('donor'); set('type', 'restaurant') }}>Food donor</button></div>
          {role === 'donor' ? <><Field label="Business name" required value={form.business_name} onChange={(v) => set('business_name', v)} /><Field label="Business type" as="select" value={form.type} onChange={(v) => set('type', v)} options={['restaurant', 'caterer', 'shop', 'community_kitchen']} /><Field label="Demo contact name" required value={form.contact_name} onChange={(v) => set('contact_name', v)} /></> : <><Field label="Organization name" required value={form.org_name} onChange={(v) => set('org_name', v)} /><Field label="Organization type" as="select" value={form.type} onChange={(v) => set('type', v)} options={['NGO', 'shelter', 'community kitchen', 'school']} /><Field label="Demo registration ID" required value={form.reg_id} onChange={(v) => set('reg_id', v)} /><Field label="Demo contact name" required value={form.contact} onChange={(v) => set('contact', v)} /></>}
          <Field label="Demo phone" required value={form.phone} onChange={(v) => set('phone', v)} placeholder="+91-9000000000" /><Field label="Demo address" required value={form.address} onChange={(v) => set('address', v)} placeholder="Demo Address, Sample Street, Hyderabad" />
          {role === 'donor' ? <><Field label="City / area" required value={form.city} onChange={(v) => set('city', v)} /></> : <><Field label="Service area" required value={form.service_area} onChange={(v) => set('service_area', v)} /><div className="field-row"><Field label="People served (approx.)" value={form.people_served} onChange={(v) => set('people_served', v)} type="number" /><Field label="Dietary needs" value={form.dietary_needs} onChange={(v) => set('dietary_needs', v)} /></div></>}
        </>}
        <Field label="Email address" required type="email" value={form.email} onChange={(v) => set('email', v)} />
        <Field label="Password" required type="password" minLength="6" value={form.password} onChange={(v) => set('password', v)} />
        <button className="btn btn-primary btn-wide" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'} <ArrowRight size={16} /></button>
      </form>
      {!register && <div className="demo-accounts"><h3>Quick-fill demo accounts</h3><div className="demo-account-buttons"><button onClick={() => demo('donor1@demo.com', 'Donor@123')}>Donor</button><button onClick={() => demo('recipient1@demo.com', 'Recipient@123')}>Recipient</button><button onClick={() => demo('admin@demo.com', 'Admin@123')}>Admin</button></div><small>Donor@123 · Recipient@123 · Admin@123</small></div>}
      {register && <p className="form-note">Use fictional demo details only. Profiles must include contact and service-area details to request food.</p>}
    </div></PageShell>
}

function Field({ label, value, onChange, type = 'text', required = false, as = 'input', options = [], placeholder, min, max, step, minLength }) {
  return <label className="field"><span>{label}{required && <i> *</i>}</span>{as === 'select' ? <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select> : <input required={required} type={type} value={value} min={min} max={max} step={step} minLength={minLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</label>
}

function Browse() {
  const [filters, setFilters] = useState({ search: '', category: '', dietary_tag: '', area: '', window: '' })
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function load(activeFilters = filters) {
    setLoading(true); setError('')
    try {
      const params = Object.fromEntries(Object.entries(activeFilters).filter(([key, value]) => key !== 'window' && value))
      const { data } = await listingsApi.browse(params)
      setListings(data.listings.filter((item) => !activeFilters.window || parseDateTime(item.pickup_window_end) < new Date(Date.now() + Number(activeFilters.window) * 3_600_000)))
    } catch { setError('We couldn’t load donations. Please try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  return <PageShell><div className="page-heading browse-heading"><div><div className="eyebrow">GOOD FOOD, CLOSE BY</div><h1>Find food to share.</h1><p>Discover surplus food from local donors and coordinate a pickup.</p></div><div className="browse-count"><b>{listings.length}</b><span>open donations</span></div></div>
    <div className="filter-bar"><label className="search-field"><Search size={17} /><input placeholder="Search meals, donors, ingredients…" value={filters.search} onChange={(e) => change('search', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} /></label>
      <select aria-label="Food category" value={filters.category} onChange={(e) => change('category', e.target.value)}><option value="">All categories</option>{categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <select aria-label="Dietary tag" value={filters.dietary_tag} onChange={(e) => change('dietary_tag', e.target.value)}><option value="">Any dietary tag</option>{dietaryTags.map((tag) => <option key={tag} value={tag}>{pretty(tag)}</option>)}</select>
      <input aria-label="Area" placeholder="Area / city" value={filters.area} onChange={(e) => change('area', e.target.value)} />
      <select aria-label="Pickup window" value={filters.window} onChange={(e) => change('window', e.target.value)}><option value="">Any pickup deadline</option><option value="2">Within 2 hours</option><option value="6">Within 6 hours</option><option value="24">Within 24 hours</option></select>
      <button className="btn btn-primary" onClick={load}>Search</button>
    </div>
    <div className="results-top"><span>{loading ? 'Finding donations…' : `${listings.length} ${listings.length === 1 ? 'donation' : 'donations'} available`}</span><span><Clock3 size={14} /> Pickup deadlines update live</span></div>
    {error ? <div className="empty-state">{error} <button className="text-link" onClick={() => load()}>Try again</button></div> : loading ? <div className="loading">Loading fresh donations…</div> : listings.length ? <div className="listing-grid browse-grid">{listings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div> : <div className="empty-state"><span className="empty-emoji">🥬</span><h3>No donations match those filters yet</h3><p>Try a different search or clear a filter. New food gets added regularly.</p><button className="btn btn-outline" onClick={() => { const empty = { search: '', category: '', dietary_tag: '', area: '', window: '' }; setFilters(empty); load(empty) }}>Clear filters</button></div>}
  </PageShell>
}

function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState(null)
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [confirmWindow, setConfirmWindow] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  useEffect(() => { listingsApi.get(id).then(({ data }) => setListing(data.listing)).catch((error) => toast.error(error.response?.data?.error || 'Listing unavailable')).finally(() => setLoading(false)) }, [id])
  async function requestFood(event) {
    event.preventDefault()
    if (!confirmWindow) return toast.error('Please confirm you can collect during the pickup window')
    try { const { data } = await requestsApi.create({ listing_id: Number(id), quantity_requested: Number(qty), note, can_collect: true }); toast.success('Request sent to the donor'); navigate(`/requests/${data.request.id}`) }
    catch (error) { toast.error(error.response?.data?.error || 'Could not submit request') }
  }
  async function reportListing(reason) {
    try { await reportsApi.create({ target_type: 'listing', target_id: Number(id), reason, description: '' }); toast.success('Report sent to the admin team'); setReportOpen(false) }
    catch (error) { toast.error(error.response?.data?.error || 'Could not send report') }
  }
  if (loading) return <PageShell><div className="loading">Loading listing…</div></PageShell>
  if (!listing) return <PageShell><div className="empty-state"><h2>Listing not found</h2><Link to="/browse">Back to donations</Link></div></PageShell>
  const donor = listing.donor_profile || {}
  return <PageShell><div className="breadcrumbs"><Link to="/browse">Available food</Link> / {listing.title}</div><div className="detail-layout"><article className="detail-main">
    <div className="detail-cover"><div className="cover-art"><div className="cover-plate"><span>🥗</span></div><i className="cover-leaf">✳</i><i className="cover-dot">✳</i></div></div>
    <div className="detail-title-row"><div><span className="category-pill">{categoryName(listing.category)}</span><h1>{listing.title}</h1><p className="muted">Shared by {donor.business_name || 'Community donor'} · {donor.city || 'Hyderabad'}</p></div><span className={statusClass(listing.status)}>{pretty(listing.status)}</span></div>
    <p className="detail-description">{listing.description}</p>
    <div className="detail-quantities"><div><span>Available now</span><b>{listing.quantity_remaining} <small>{listing.unit}</small></b><small>of {listing.quantity_total} {listing.unit} total</small></div><div className="detail-deadline"><Clock3 size={19} /><span>Pickup deadline<strong>{dateTime(listing.pickup_window_end)}</strong><em><Countdown value={listing.pickup_window_end} /></em></span></div></div>
    <div className="detail-info-grid"><Info label="Pickup window" value={`${dateTime(listing.pickup_window_start)} – ${dateTime(listing.pickup_window_end)}`} /><Info label="Pickup address" value={listing.pickup_address} /><Info label="Prepared at" value={dateTime(listing.prepared_at)} /><Info label="Use by" value={dateTime(listing.use_by)} /></div>
    <div className="detail-block"><h3>Food notes</h3><div className="tag-row">{(listing.dietary_tags || []).map((tag) => <span className="food-tag" key={tag}>{pretty(tag)}</span>)}</div><p>{listing.storage_notes || 'Please contact the donor for handling details.'}</p></div>
    <div className="safety-inline"><ShieldCheck size={18} /><p><b>Food safety note</b><br />{safetyText}</p></div>
    {user && <button className="report-link" onClick={() => setReportOpen(true)}>Report this listing</button>}
  </article><aside className="request-panel">
    <div className="panel-title"><span className="donor-avatar">{(donor.business_name || 'D')[0]}</span><div><b>{donor.business_name || 'Community donor'}</b><small>{pretty(donor.type || 'local donor')}</small></div></div>
    <div className="panel-rule" /><div className="pickup-alert"><Clock3 size={18} /><div><b>Pickup by {dateTime(listing.pickup_window_end)}</b><span><Countdown value={listing.pickup_window_end} /></span></div></div>
    {user?.role === 'recipient' && listing.status === 'active' ? <form className="form-stack request-form" onSubmit={requestFood}><Field label={`Quantity (${listing.unit})`} type="number" min="0.1" max={listing.quantity_remaining} step="any" required value={qty} onChange={setQty} /><label className="field"><span>Note to donor</span><textarea rows="3" placeholder="Tell the donor a little about your pickup…" value={note} onChange={(e) => setNote(e.target.value)} /></label><label className="check-label"><input type="checkbox" checked={confirmWindow} onChange={(e) => setConfirmWindow(e.target.checked)} /><span>I can collect within the pickup window.</span></label><button className="btn btn-primary btn-wide">Request this food <ArrowRight size={16} /></button></form>
      : !user ? <div className="panel-signin"><p>Sign in as a recipient organization to request this donation.</p><Link className="btn btn-primary btn-wide" to="/login">Sign in to request <ArrowRight size={15} /></Link></div>
        : user.role !== 'recipient' ? <p className="form-note">Only recipient organizations can request food.</p>
          : <p className="form-note">This donation is no longer available for requests.</p>}
    <div className="panel-foot"><ShieldCheck size={15} />Pickup details are coordinated directly in this demo.</div>
  </aside></div>{reportOpen && <ReasonDialog title="Report this listing" description="Tell the admin team what concerns you about this listing." submitLabel="Send report" onCancel={() => setReportOpen(false)} onSubmit={reportListing} />}</PageShell>
}

function Info({ label, value }) {
  return <div><span>{label}</span><b>{value || 'Not provided'}</b></div>
}

function ListingForm() {
  const { id } = useParams()
  const edit = Boolean(id)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'cooked_meal', tags: [], quantity_total: '', unit: 'portions', prepared_at: '', use_by: '', storage_notes: '', pickup_address: '', pickup_window_start: '', pickup_window_end: '', safety_attested: false })
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  useEffect(() => {
    if (edit) listingsApi.get(id).then(({ data }) => { const listing = data.listing; setForm({ ...listing, tags: listing.dietary_tags || [], quantity_total: listing.quantity_total, safety_attested: Boolean(listing.safety_attested) }) }).catch((error) => toast.error(error.response?.data?.error || 'Could not load listing'))
  }, [id, edit])
  const perishable = ['cooked_meal', 'produce', 'dairy'].includes(form.category)
  async function submit(event) {
    event.preventDefault()
    if (!form.safety_attested) return toast.error('The safety attestation is required before publishing')
    setBusy(true)
    const data = { ...form, dietary_tags: form.tags, quantity_total: Number(form.quantity_total), safety_attested: true }
    delete data.tags
    try { const result = edit ? await listingsApi.update(id, data) : await listingsApi.create(data); toast.success(edit ? 'Listing updated' : 'Food donation published'); navigate(`/listings/${result.data.listing.id}`) }
    catch (error) { toast.error(error.response?.data?.error || 'Could not save listing') }
    finally { setBusy(false) }
  }
  function toggleTag(tag) { set('tags', form.tags.includes(tag) ? form.tags.filter((item) => item !== tag) : [...form.tags, tag]) }
  return <PageShell className="form-page"><div className="breadcrumbs"><Link to="/dashboard">Dashboard</Link> / {edit ? 'Edit donation' : 'Share food'}</div><div className="page-heading"><div><div className="eyebrow">A LITTLE GOOD GOES A LONG WAY</div><h1>{edit ? 'Edit your donation' : 'Share surplus food.'}</h1><p>Add clear pickup details so a local organization can plan ahead.</p></div></div>
    <form className="listing-form card-panel" onSubmit={submit}><div className="form-section"><h2>About the food</h2><div className="form-grid"><Field label="Listing title" required value={form.title} onChange={(v) => set('title', v)} placeholder="e.g. Fresh vegetable curry & rice" /><Field label="Food category" as="select" value={form.category} onChange={(v) => set('category', v)} options={categories.map(([key]) => key)} /><label className="field full-span"><span>Description</span><textarea rows="3" value={form.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="What’s included? How was it prepared?" /></label><div className="field full-span"><span className="field-label">Dietary tags</span><div className="tag-select">{dietaryTags.map((tag) => <button type="button" className={form.tags.includes(tag) ? 'selected' : ''} key={tag} onClick={() => toggleTag(tag)}>{form.tags.includes(tag) && <CheckCircle2 size={13} />}{pretty(tag)}</button>)}</div></div></div></div>
      <div className="form-section"><h2>Quantity & timing</h2><div className="form-grid"><Field label="Quantity" type="number" min="0.1" step="any" required value={form.quantity_total} onChange={(v) => set('quantity_total', v)} /><Field label="Unit" as="select" value={form.unit} onChange={(v) => set('unit', v)} options={['portions', 'kg', 'boxes']} /><Field label="Prepared at (optional)" type="datetime-local" value={dateTimeField(form.prepared_at)} onChange={(v) => set('prepared_at', v)} /><Field label="Use by" required={perishable} type="datetime-local" value={dateTimeField(form.use_by)} onChange={(v) => set('use_by', v)} /><Field label="Pickup window starts" type="datetime-local" required value={dateTimeField(form.pickup_window_start)} onChange={(v) => set('pickup_window_start', v)} /><Field label="Pickup window ends" type="datetime-local" required value={dateTimeField(form.pickup_window_end)} onChange={(v) => set('pickup_window_end', v)} /></div>{perishable && <div className="form-warning"><Clock3 size={17} />This food category needs a future use-by time that is after the pickup window ends.</div>}</div>
      <div className="form-section"><h2>Pickup & handling</h2><div className="form-grid"><Field label="Pickup address (demo)" required value={form.pickup_address} onChange={(v) => set('pickup_address', v)} placeholder="Demo Address, 12 Sample Street, Hyderabad" /><label className="field"><span>Storage / handling notes</span><textarea rows="2" value={form.storage_notes || ''} onChange={(e) => set('storage_notes', e.target.value)} placeholder="e.g. Kept hot above 60°C" /></label></div></div>
      <label className="attestation"><input type="checkbox" checked={Boolean(form.safety_attested)} onChange={(e) => set('safety_attested', e.target.checked)} /><span><b>Required safety attestation</b><br />I confirm the information is accurate, the food was handled per applicable local food-safety rules, and it is safe to consume before the stated use-by time.</span></label>
      <div className="form-actions"><Link className="btn btn-quiet" to="/dashboard">Cancel</Link><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : edit ? 'Save changes' : 'Publish donation'} <ArrowRight size={16} /></button></div>
    </form>
  </PageShell>
}

function Dashboard() {
  const { user } = useAuth()
  if (user.role === 'admin') return <Navigate to="/admin" replace />
  return user.role === 'donor' ? <DonorDashboard /> : <RecipientDashboard />
}

function DonorDashboard() {
  const { user } = useAuth()
  const [listings, setListings] = useState([])
  const [requests, setRequests] = useState([])
  const [tab, setTab] = useState('overview')
  const [cancelTarget, setCancelTarget] = useState(null)
  async function load() {
    try { const [listData, requestData] = await Promise.all([listingsApi.my(), requestsApi.list()]); setListings(listData.data.listings); setRequests(requestData.data.requests) }
    catch (error) { toast.error(error.response?.data?.error || 'Could not load dashboard') }
  }
  useEffect(() => { load() }, [])
  async function decide(request, action) {
    try { if (action === 'accept') await requestsApi.accept(request.id); else if (action === 'reject') await requestsApi.reject(request.id, 'Unable to fulfill this request'); else await requestsApi.pickup(request.id); toast.success(action === 'pickup' ? 'Pickup confirmed' : `Request ${action}ed`); load() }
    catch (error) { toast.error(error.response?.data?.error || `Could not ${action} request`) }
  }
  async function cancelListing(listing, reason) {
    try { await listingsApi.cancel(listing.id, reason); toast.success('Listing cancelled'); setCancelTarget(null); load() }
    catch (error) { toast.error(error.response?.data?.error || 'Could not cancel listing') }
  }
  const completed = requests.filter((request) => request.status === 'completed')
  const active = listings.filter((listing) => ['active', 'fully_reserved'].includes(listing.status))
  const pending = requests.filter((request) => request.status === 'pending')
  return <PageShell><div className="dash-welcome"><div><div className="eyebrow">DONOR WORKSPACE</div><h1>Good to see you, {user.profile?.business_name || 'food donor'}.</h1><p>Every thoughtful pickup makes a difference in your community.</p></div><Link className="btn btn-primary" to="/listings/new">+ Share surplus food</Link></div>
    <div className="stats-grid"><Stat value={completed.length} label="Completed donations" note="Pickup confirmed" icon="♡" /><Stat value={completed.reduce((sum, item) => sum + Number(item.quantity_requested || 0), 0)} label="Quantity shared" note="Across all pickups" icon="↗" /><Stat value={pending.length} label="Requests to review" note="Waiting for your response" icon="◷" /><Stat value={active.length} label="Active listings" note="Available or reserved" icon="⌂" /></div>
    <div className="tab-row"><button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>Overview</button><button className={tab === 'requests' ? 'selected' : ''} onClick={() => setTab('requests')}>Requests <span>{pending.length}</span></button><button className={tab === 'listings' ? 'selected' : ''} onClick={() => setTab('listings')}>My listings</button></div>
    {(tab === 'overview' || tab === 'requests') && <section className="dash-panel"><div className="panel-heading"><div><h2>Requests from your community</h2><p>Review and coordinate incoming pickups.</p></div><button className="text-link" onClick={() => setTab('requests')}>View all <ArrowRight size={15} /></button></div>{requests.length ? <div className="table-wrap"><table><thead><tr><th>Donation</th><th>Organization</th><th>Quantity</th><th>Status</th><th>Pickup deadline</th><th>Action</th></tr></thead><tbody>{requests.slice(0, tab === 'requests' ? undefined : 5).map((request) => <tr key={request.id}><td><Link to={`/requests/${request.id}`}>{request.listing_title}</Link></td><td>{request.recipient_profile?.org_name || request.recipient_email}</td><td>{request.quantity_requested} {request.unit}</td><td><span className={statusClass(request.status)}>{pretty(request.status)}</span></td><td>{dateTime(request.pickup_window_end)}</td><td className="table-actions">{request.status === 'pending' && <><button className="mini-action accept" onClick={() => decide(request, 'accept')}>Accept</button><button className="mini-action reject" onClick={() => decide(request, 'reject')}>Decline</button></>}{request.status === 'accepted' && <button className="mini-action accept" onClick={() => decide(request, 'pickup')}>Confirm pickup</button>}</td></tr>)}</tbody></table></div> : <div className="empty-state compact">No requests yet. Active listings will appear to nearby organizations.</div>}</section>}
    {(tab === 'overview' || tab === 'listings') && <section className="dash-panel"><div className="panel-heading"><div><h2>Your donations</h2><p>Track remaining quantity and pickup deadlines.</p></div><Link className="text-link" to="/listings/new">Create a listing <ArrowRight size={15} /></Link></div>{listings.length ? <div className="my-listings">{listings.slice(0, tab === 'listings' ? undefined : 4).map((listing) => <div className="my-listing" key={listing.id}><div className="mini-food"><Utensils size={17} /></div><div className="my-listing-main"><b>{listing.title}</b><small>{listing.quantity_remaining} {listing.unit} remaining · Pickup by {dateTime(listing.pickup_window_end)}</small></div><span className={statusClass(listing.status)}>{pretty(listing.status)}</span>{['active', 'fully_reserved'].includes(listing.status) && <><Link className="mini-action" to={`/listings/${listing.id}/edit`}>Edit</Link><button className="mini-action reject" onClick={() => setCancelTarget(listing)}>Cancel</button></>}</div>)}</div> : <div className="empty-state compact">No listings yet. Share your first surplus donation.</div>}</section>}
    {cancelTarget && <ReasonDialog title={`Cancel “${cancelTarget.title}”?`} description="Open requests will be cancelled and recipients notified." initialReason="Donor cancelled listing" submitLabel="Cancel listing" onCancel={() => setCancelTarget(null)} onSubmit={(reason) => cancelListing(cancelTarget, reason)} />}
  </PageShell>
}

function RecipientDashboard() {
  const { user } = useAuth()
  const [requests, setRequests] = useState([])
  const [tab, setTab] = useState('all')
  async function load() { try { const { data } = await requestsApi.list(); setRequests(data.requests) } catch (error) { toast.error(error.response?.data?.error || 'Could not load requests') } }
  useEffect(() => { load() }, [])
  const filtered = tab === 'all' ? requests : requests.filter((request) => request.status === tab)
  async function cancel(request) { try { await requestsApi.cancel(request.id, 'Recipient cancelled request'); toast.success('Request cancelled'); load() } catch (error) { toast.error(error.response?.data?.error || 'Could not cancel request') } }
  return <PageShell><div className="dash-welcome"><div><div className="eyebrow">RECIPIENT WORKSPACE</div><h1>Welcome, {user.profile?.org_name || 'community partner'}.</h1><p>See your requests and coordinate upcoming pickups.</p></div><Link className="btn btn-primary" to="/browse"><Search size={16} /> Find food</Link></div>
    <div className="stats-grid"><Stat value={requests.filter((r) => r.status === 'pending').length} label="Pending requests" note="Awaiting donor response" icon="◷" /><Stat value={requests.filter((r) => r.status === 'accepted').length} label="Upcoming pickups" note="Plan your collection" icon="⌖" /><Stat value={requests.filter((r) => r.status === 'completed').length} label="Completed pickups" note="Thank you for sharing" icon="♡" /><Stat value={requests.length} label="Total requests" note="Your request history" icon="↗" /></div>
    <section className="dash-panel"><div className="panel-heading"><div><h2>Your request history</h2><p>Updates from the donors you’ve connected with.</p></div></div><div className="tab-row small-tabs">{['all', 'pending', 'accepted', 'completed', 'rejected', 'cancelled', 'missed', 'expired'].map((status) => <button key={status} className={tab === status ? 'selected' : ''} onClick={() => setTab(status)}>{pretty(status)}</button>)}</div>{filtered.length ? <div className="request-cards">{filtered.map((request) => <article className="request-card" key={request.id}><div className="request-card-top"><div className="mini-food"><Utensils size={16} /></div><span className={statusClass(request.status)}>{pretty(request.status)}</span></div><h3><Link to={`/requests/${request.id}`}>{request.listing_title}</Link></h3><div className="request-card-info"><span>{request.quantity_requested} {request.unit}</span><span>{request.donor_profile?.business_name || request.donor_email}</span></div><div className="request-card-deadline"><Clock3 size={15} />Pickup by {dateTime(request.pickup_window_end)}</div><div className="request-card-actions"><Link className="text-link" to={`/requests/${request.id}`}>View timeline <ArrowRight size={14} /></Link>{['pending', 'accepted'].includes(request.status) && <button className="mini-action reject" onClick={() => cancel(request)}>Cancel request</button>}</div></article>)}</div> : <div className="empty-state compact">No requests in this category yet. Browse available food to get started.</div>}</section>
  </PageShell>
}

function Stat({ value, label, note, icon }) {
  return <div className="stat-card"><span className="stat-icon">{icon}</span><b>{value}</b><strong>{label}</strong><small>{note}</small></div>
}

function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState(user.profile || {})
  const [busy, setBusy] = useState(false)
  const donor = user.role === 'donor'
  function set(key, value) { setProfile((current) => ({ ...current, [key]: value })) }
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const { data } = await usersApi.updateProfile(user.id, profile)
      updateUser(data.user)
      toast.success('Profile updated')
    } catch (error) { toast.error(error.response?.data?.error || 'Could not update profile') }
    finally { setBusy(false) }
  }
  const profileFields = donor
    ? [['business_name', 'Business name'], ['type', 'Business type'], ['contact_name', 'Demo contact name'], ['phone', 'Demo phone'], ['address', 'Demo address'], ['city', 'City / area']]
    : [['org_name', 'Organization name'], ['type', 'Organization type'], ['reg_id', 'Demo registration ID'], ['contact', 'Demo contact name'], ['phone', 'Demo phone'], ['address', 'Demo address'], ['service_area', 'Service area'], ['people_served', 'People served (approx.)'], ['dietary_needs', 'Dietary needs']]
  return <PageShell className="form-page"><div className="page-heading"><div><div className="eyebrow">YOUR ACCOUNT</div><h1>Edit your profile.</h1><p>Use fictional demo details only. Contact details are shown for coordination in this prototype.</p></div></div><form className="listing-form card-panel form-stack" onSubmit={submit}><div className="profile-email"><span>Email</span><b>{user.email}</b><small>Account role: {pretty(user.role)}</small></div>{profileFields.map(([key, label]) => <Field key={key} label={label} required={['business_name', 'org_name', 'type', 'reg_id', 'contact', 'contact_name', 'phone', 'address', 'service_area', 'city'].includes(key)} value={profile[key] || ''} onChange={(value) => set(key, value)} />)}<div className="form-actions"><Link className="btn btn-quiet" to="/dashboard">Back</Link><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div></form></PageShell>
}

function RequestDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [request, setRequest] = useState(null)
  const [history, setHistory] = useState([])
  const navigate = useNavigate()
  async function load() { try { const { data } = await requestsApi.get(id); setRequest(data.request); setHistory(data.history) } catch (error) { toast.error(error.response?.data?.error || 'Could not load request') } }
  useEffect(() => { load() }, [id])
  async function action(type) {
    try {
      if (type === 'accept') await requestsApi.accept(id)
      if (type === 'reject') await requestsApi.reject(id, 'Unable to fulfill request')
      if (type === 'cancel') await requestsApi.cancel(id, 'Request cancelled')
      if (type === 'pickup') { await requestsApi.pickup(id); toast.success('Pickup confirmed!'); navigate(`/requests/${id}/confirmation`) }
      else { toast.success(`Request ${type === 'accept' ? 'accepted' : type === 'reject' ? 'declined' : 'cancelled'}`); load() }
    } catch (error) { toast.error(error.response?.data?.error || 'Could not update request') }
  }
  async function confirmReceipt() { try { await requestsApi.confirm(id); toast.success('Receipt confirmed'); load() } catch (error) { toast.error(error.response?.data?.error || 'Could not confirm receipt') } }
  if (!request) return <PageShell><div className="loading">Loading request details…</div></PageShell>
  const canDonor = user.role === 'donor' && request.donor_id === user.id
  const canRecipient = user.role === 'recipient' && request.recipient_id === user.id
  return <PageShell><div className="breadcrumbs"><Link to="/dashboard">Dashboard</Link> / Request #{request.id}</div><div className="page-heading request-title"><div><div className="eyebrow">PICKUP COORDINATION</div><h1>{request.listing_title}</h1><p>Request reference #{request.id} · submitted {dateTime(request.created_at)}</p></div><span className={statusClass(request.status)}>{pretty(request.status)}</span></div>
    <div className="request-detail-grid"><div className="dash-panel request-summary"><h2>Pickup details</h2><div className="detail-info-grid"><Info label="Requested quantity" value={`${request.quantity_requested} ${request.unit}`} /><Info label="Pickup deadline" value={dateTime(request.pickup_window_end)} /><Info label="Pickup address" value={request.pickup_address} /><Info label="Reference code" value={request.reference_code} /></div>{request.note && <div className="detail-block"><h3>Note</h3><p>{request.note}</p></div>}
      {request.status === 'completed' && <div className="pickup-confirmed"><CheckCircle2 size={21} /><div><b>Pickup confirmed</b><span>Reference code: {request.reference_code}</span></div>{canRecipient && !request.recipient_confirmed && <button className="btn btn-outline" onClick={confirmReceipt}>Confirm receipt</button>}{request.recipient_confirmed && <span className="status status-completed">Receipt confirmed</span>}</div>}
      <div className="action-row">{canDonor && request.status === 'pending' && <><button className="btn btn-primary" onClick={() => action('accept')}>Accept request</button><button className="btn btn-outline" onClick={() => action('reject')}>Decline</button></>}{request.status === 'accepted' && (canDonor || canRecipient) && <button className="btn btn-outline" onClick={() => action('cancel')}>Cancel request</button>}{canDonor && request.status === 'accepted' && <button className="btn btn-primary" onClick={() => action('pickup')}>Mark picked up</button>}</div>
    </div><aside className="dash-panel timeline-panel"><h2>Status timeline</h2><p className="muted">Every request update appears here.</p><div className="timeline">{history.map((item, index) => <div className="timeline-item" key={item.id}><span className="timeline-dot" /><div><b>{pretty(item.to_status)}</b><span>{item.note || `Request ${item.to_status}`}</span><small>{dateTime(item.timestamp)}{item.actor_email ? ` · ${item.actor_email}` : ' · System'}</small></div>{index < history.length - 1 && <i />}</div>)}</div></aside></div>
  </PageShell>
}

function Confirmation() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  useEffect(() => { requestsApi.get(id).then(({ data }) => setRequest(data.request)).catch((error) => toast.error(error.response?.data?.error || 'Could not load confirmation')) }, [id])
  return <PageShell className="confirmation-page"><div className="confirm-card"><span className="confirm-icon"><CheckCircle2 size={38} /></span><div className="eyebrow">A GOOD THING, DONE</div><h1>Pickup confirmed.</h1><p>{request ? `${request.quantity_requested} ${request.unit} of ${request.listing_title} has been marked as picked up.` : 'Your donation pickup has been confirmed.'}</p><div className="reference-code"><span>YOUR REFERENCE CODE</span><b>{request?.reference_code || 'Loading…'}</b></div><p className="muted">Thank you for helping good food find a good home.</p><Link className="btn btn-primary" to="/dashboard">Back to dashboard <ArrowRight size={16} /></Link></div></PageShell>
}

function AdminDashboard() {
  const [listings, setListings] = useState([])
  const [users, setUsers] = useState([])
  const [reports, setReports] = useState([])
  const [tab, setTab] = useState('reports')
  const [removeTarget, setRemoveTarget] = useState(null)
  async function load() {
    try {
      const [listData, userData, reportData] = await Promise.all([listingsApi.browse({ status: 'active' }), usersApi.list(), reportsApi.list()])
      const statuses = ['fully_reserved', 'completed', 'expired', 'removed', 'draft']
      const all = [...listData.data.listings]
      for (const status of statuses) { const result = await listingsApi.browse({ status }); all.push(...result.data.listings) }
      setListings(all); setUsers(userData.data.users); setReports(reportData.data.reports)
    } catch (error) { toast.error(error.response?.data?.error || 'Could not load admin workspace') }
  }
  useEffect(() => { load() }, [])
  async function remove(listing, reason) {
    try { await listingsApi.remove(listing.id, reason); toast.success('Listing removed and donor notified'); setRemoveTarget(null); load() }
    catch (error) { toast.error(error.response?.data?.error || 'Could not remove listing') }
  }
  async function reportStatus(report, status) {
    try { await reportsApi.updateStatus(report.id, status, status === 'actioned' ? 'Reviewed by demo admin' : ''); toast.success(`Report marked ${status}`); load() }
    catch (error) { toast.error(error.response?.data?.error || 'Could not update report') }
  }
  async function suspend(user) {
    try { await usersApi.suspend(user.id, !user.suspended); toast.success(user.suspended ? 'Account unsuspended' : 'Account suspended'); load() }
    catch (error) { toast.error(error.response?.data?.error || 'Could not update account') }
  }
  return <PageShell><div className="dash-welcome"><div><div className="eyebrow">PLATFORM OVERSIGHT</div><h1>Admin workspace.</h1><p>Review reports, moderate listings, and manage demo accounts.</p></div></div>
    <div className="stats-grid"><Stat value={listings.filter((item) => item.status === 'active').length} label="Open listings" note="Available to recipients" icon="⌂" /><Stat value={users.length} label="Demo accounts" note="All platform roles" icon="◎" /><Stat value={reports.filter((report) => report.status === 'open').length} label="Open reports" note="Need review" icon="⚑" /><Stat value={listings.filter((item) => item.status === 'removed').length} label="Removed listings" note="Moderation actions" icon="×" /></div>
    <div className="tab-row"><button className={tab === 'reports' ? 'selected' : ''} onClick={() => setTab('reports')}>Reports <span>{reports.filter((r) => r.status === 'open').length}</span></button><button className={tab === 'listings' ? 'selected' : ''} onClick={() => setTab('listings')}>Listings</button><button className={tab === 'users' ? 'selected' : ''} onClick={() => setTab('users')}>Users</button></div>
    {tab === 'reports' && <section className="dash-panel"><div className="panel-heading"><div><h2>Community reports</h2><p>Review concerns submitted by platform users.</p></div></div>{reports.length ? <div className="table-wrap"><table><thead><tr><th>Target</th><th>Reason</th><th>Reported by</th><th>Status</th><th>Submitted</th><th>Update</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{pretty(report.target_type)} #{report.target_id}</td><td><b>{report.reason}</b><small className="table-sub">{report.description}</small></td><td>{report.reporter_email}</td><td><span className={statusClass(report.status)}>{pretty(report.status)}</span></td><td>{dateTime(report.created_at)}</td><td>{report.status === 'open' ? <div className="table-actions"><button className="mini-action" onClick={() => reportStatus(report, 'reviewed')}>Review</button><button className="mini-action accept" onClick={() => reportStatus(report, 'actioned')}>Action</button><button className="mini-action reject" onClick={() => reportStatus(report, 'dismissed')}>Dismiss</button></div> : <button className="mini-action" onClick={() => reportStatus(report, 'open')}>Reopen</button>}</td></tr>)}</tbody></table></div> : <div className="empty-state compact">No reports received.</div>}</section>}
    {tab === 'listings' && <section className="dash-panel"><div className="panel-heading"><div><h2>All listings</h2><p>Remove inappropriate listings with a reason; the donor will be notified.</p></div></div><div className="table-wrap"><table><thead><tr><th>Listing</th><th>Donor</th><th>Quantity</th><th>Status</th><th>Pickup by</th><th>Moderation</th></tr></thead><tbody>{listings.map((item) => <tr key={item.id}><td><Link to={`/listings/${item.id}`}>{item.title}</Link></td><td>{item.donor_profile?.business_name}</td><td>{item.quantity_remaining} {item.unit}</td><td><span className={statusClass(item.status)}>{pretty(item.status)}</span></td><td>{dateTime(item.pickup_window_end)}</td><td>{!['removed', 'completed', 'expired', 'cancelled'].includes(item.status) && <button className="mini-action reject" onClick={() => setRemoveTarget(item)}>Remove</button>}</td></tr>)}</tbody></table></div></section>}
    {tab === 'users' && <section className="dash-panel"><div className="panel-heading"><div><h2>Platform users</h2><p>Demo accounts and profile roles.</p></div></div><div className="table-wrap"><table><thead><tr><th>Account</th><th>Role</th><th>Profile</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td>{item.email}</td><td>{pretty(item.role)}</td><td>{item.profile?.business_name || item.profile?.org_name || item.profile?.name || '—'}</td><td>{dateTime(item.created_at)}</td><td><span className={item.suspended ? 'status status-removed' : 'status status-active'}>{item.suspended ? 'Suspended' : 'Active'}</span></td><td>{item.role !== 'admin' && <button className="mini-action reject" onClick={() => suspend(item)}>{item.suspended ? 'Unsuspend' : 'Suspend'}</button>}</td></tr>)}</tbody></table></div></section>}
    {removeTarget && <ReasonDialog title={`Remove “${removeTarget.title}”?`} description="A removal reason is required and will be sent to the donor." initialReason="Inaccurate or unsafe listing information" submitLabel="Remove listing" onCancel={() => setRemoveTarget(null)} onSubmit={(reason) => remove(removeTarget, reason)} />}
  </PageShell>
}

function ReasonDialog({ title, description, initialReason = '', submitLabel, onCancel, onSubmit }) {
  const [reason, setReason] = useState(initialReason)
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}><section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" type="button" aria-label="Close dialog" onClick={onCancel}><X size={17} /></button><div className="eyebrow">GOODPLATE MODERATION</div><h2 id="modal-title">{title}</h2><p>{description}</p><label className="field"><span>Reason</span><textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} required /></label><div className="form-actions"><button className="btn btn-quiet" type="button" onClick={onCancel}>Keep as is</button><button className="btn btn-primary" type="button" disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>{submitLabel}</button></div></section></div>
}

function Safety() {
  return <PageShell className="safety-page"><div className="safety-hero"><span><ShieldCheck size={25} /></span><div className="eyebrow">PLEASE READ BEFORE USING GOODPLATE</div><h1>Food safety & limitations.</h1><p>GoodPlate helps people coordinate. It does not certify food, inspect kitchens, or guarantee a safe outcome.</p></div><div className="safety-content"><section><h2>What this platform is</h2><p>GoodPlate is a coordination tool for donors to list surplus food and eligible community organizations to request it for pickup. A listing is not an endorsement, inspection, or safety certification by the platform.</p></section><section><h2>Donor responsibilities</h2><p>Donors are responsible for providing accurate preparation, handling, storage, and use-by information and for complying with all applicable local food-safety rules. Donors should not list food they believe is unsafe to consume.</p></section><section><h2>Recipient responsibilities</h2><p>Recipients should inspect food before accepting it, transport and store it appropriately, and follow their own food-safety procedures. Recipients may decline food that does not meet their requirements.</p></section><section><h2>What we cannot verify</h2><ul><li>No temperature or cold-chain monitoring.</li><li>No verification of donor or recipient identity, registration, or credentials.</li><li>No guarantee that food descriptions, quantities, handling information, or pickup arrangements are accurate.</li><li>No legal-compliance guarantee, payment processing, or real-time email/SMS notifications.</li><li>The system uses single-node SQLite and is a demo prototype, not a production service.</li></ul></section><section className="demo-warning"><h2>Demo data only</h2><p>All names, addresses, phone numbers, organizations, and listings are fictional. Do not enter real personal or sensitive information.</p></section></div></PageShell>
}

function NotFound() {
  return <PageShell className="not-found"><span>404</span><h1>That page isn’t at this table.</h1><p>The link may have changed, or the page may no longer be available.</p><Link className="btn btn-primary" to="/">Go to GoodPlate <ArrowRight size={15} /></Link></PageShell>
}

function AppRoutes() {
  return <><Header /><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route path="/browse" element={<Browse />} /><Route path="/listings/:id" element={<ListingDetail />} /><Route path="/safety" element={<Safety />} />
    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} /><Route path="/profile" element={<Protected roles={['donor', 'recipient']}><ProfilePage /></Protected>} /><Route path="/listings/new" element={<Protected roles={['donor']}><ListingForm /></Protected>} /><Route path="/listings/:id/edit" element={<Protected roles={['donor']}><ListingForm /></Protected>} /><Route path="/requests/:id" element={<Protected><RequestDetail /></Protected>} /><Route path="/requests/:id/confirmation" element={<Protected><Confirmation /></Protected>} /><Route path="/admin" element={<Protected roles={['admin']}><AdminDashboard /></Protected>} /><Route path="*" element={<NotFound />} /></Routes><SafetyFooter /></>
}

export default function App() {
  return <AuthProvider><BrowserRouter><Toaster position="top-right" toastOptions={{ duration: 3500 }} /><AppRoutes /></BrowserRouter></AuthProvider>
}
