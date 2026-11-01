import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { CLAIM_TOPICS, LEGAL_DOCS, PLANS, type ClaimTopicId, type LegalDocId, type PlanId } from '../data/content'
import { scrollToSection } from './hooks'

/**
 * A tiny hash router (`#/plans/endowment`). It needs no server rules, so the site works from any
 * static host, including a single-file page. Each route change resets scroll, updates the
 * document title and moves focus to the page heading so keyboard and screen-reader users
 * land at the top of the new page.
 */

export type Route =
  | { name: 'home' }
  | { name: 'plans' }
  | { name: 'plan'; id: PlanId }
  | { name: 'claims'; topic?: ClaimTopicId }
  | { name: 'about' }
  | { name: 'contact' }
  | { name: 'legal'; doc: LegalDocId }
  | { name: 'notfound' }

function parse(raw: string): { route: Route; section: string | null } {
  if (!raw.startsWith('/')) return { route: { name: 'home' }, section: null }
  const [pathPart, query = ''] = raw.split('?')
  const section = new URLSearchParams(query).get('section')
  const parts = pathPart.split('/').filter(Boolean)
  const [a, b] = parts
  let route: Route = { name: 'notfound' }
  if (!a) route = { name: 'home' }
  else if (a === 'plans' && parts.length === 1) route = { name: 'plans' }
  else if (a === 'plans' && parts.length === 2 && PLANS.some((p) => p.id === b)) route = { name: 'plan', id: b as PlanId }
  else if (a === 'claims' && parts.length === 1) route = { name: 'claims' }
  else if (a === 'claims' && parts.length === 2 && CLAIM_TOPICS.some((t) => t.id === b))
    route = { name: 'claims', topic: b as ClaimTopicId }
  else if (a === 'about' && parts.length === 1) route = { name: 'about' }
  else if (a === 'contact' && parts.length === 1) route = { name: 'contact' }
  else if (a === 'legal' && parts.length === 2 && b in LEGAL_DOCS) route = { name: 'legal', doc: b as LegalDocId }
  return { route, section }
}

const SUFFIX = 'Secure Sarthi'

export function titleFor(route: Route): string {
  switch (route.name) {
    case 'home':
      return `${SUFFIX}: Independent LIC insurance advisory`
    case 'plans':
      return `LIC plans compared | ${SUFFIX}`
    case 'plan':
      return `${PLANS.find((p) => p.id === route.id)!.title} | ${SUFFIX}`
    case 'claims':
      return `Claims | ${SUFFIX}`
    case 'about':
      return `About me | ${SUFFIX}`
    case 'contact':
      return `Contact us | ${SUFFIX}`
    case 'legal':
      return `${LEGAL_DOCS[route.doc].title} | ${SUFFIX}`
    default:
      return `Page not found | ${SUFFIX}`
  }
}

function routeKey(route: Route) {
  if (route.name === 'plan') return `plan:${route.id}`
  if (route.name === 'legal') return `legal:${route.doc}`
  return route.name
}

/** Which element to scroll to (and focus) for a route's section, if any. */
function sectionTarget(route: Route, section: string | null): { id: string; focus?: string } | null {
  if (route.name === 'home' && section) {
    const focus: Record<string, string> = { products: 'h2', calculator: '#calc-age', about: 'h2', services: 'h2' }
    return { id: section, focus: focus[section] }
  }
  if (route.name === 'plan' && section) return { id: `plan-${section}`, focus: section === 'calculator' ? '#calc-age, #mb-amount, #annuity-amount' : 'h2' }
  if (route.name === 'claims' && route.topic) return { id: `claim-${route.topic}`, focus: 'h2' }
  if (route.name === 'about' && section) return { id: `about-${section}`, focus: 'h2' }
  return null
}

interface RouterValue {
  route: Route
  navigate: (to: string) => void
}

const RouterContext = createContext<RouterValue | null>(null)

const readHash = () => (typeof window === 'undefined' ? '/' : window.location.hash.replace(/^#/, '') || '/')

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState({ raw: readHash(), n: 0 })
  const parsed = useMemo(() => parse(loc.raw), [loc.raw])
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    const onHash = () => setLoc((l) => (l.raw === readHash() ? l : { raw: readHash(), n: l.n + 1 }))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((to: string) => {
    // Update our own state first so the page changes even where the address bar can't (sandboxed frames).
    setLoc((l) => ({ raw: to, n: l.n + 1 }))
    try {
      if (window.location.hash !== `#${to}`) window.location.hash = to
    } catch {
      /* the in-memory state above is enough */
    }
  }, [])

  useEffect(() => {
    const { route, section } = parsed
    document.title = titleFor(route)
    const key = routeKey(route)
    const first = prevKey.current === null
    const pageChanged = prevKey.current !== key
    prevKey.current = key
    const target = sectionTarget(route, section)
    if (pageChanged && !first) window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        if (target) scrollToSection(target.id, target.focus)
        else if (!first) {
          if (!pageChanged) window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
          const h1 = document.querySelector<HTMLElement>('main h1')
          if (h1) {
            h1.setAttribute('tabindex', '-1')
            h1.focus({ preventScroll: true })
          }
        }
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.n])

  const value = useMemo(() => ({ route: parsed.route, navigate }), [parsed.route, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>')
  return ctx
}

export function useRoute() {
  return useRouter().route
}

export function Link({ to, onClick, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter()
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return
    e.preventDefault()
    navigate(to)
  }
  return (
    <a href={`#${to}`} onClick={handle} {...rest}>
      {children}
    </a>
  )
}
