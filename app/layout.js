import './globals.css';
import Link from 'next/link';
import { Suspense } from 'react';
import Motion from '@/components/Motion';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Nav from '@/components/Nav';
import { listCompanies, listRuns, listLearnings, storageMode } from '@/lib/store';
import { aiConfigured } from '@/lib/gemini';
import { gmailConfigured } from '@/lib/send';
import { ago } from '@/lib/ui';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata = { title: 'Sprinto Outreach', description: 'Domain list in, qualified and personalised cold emails out.' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const [companies, runs, learnings] = await Promise.all([listCompanies(), listRuns(1), listLearnings({ activeOnly: true })]);
  const counts = {
    review: companies.filter((c) => c.status === 'review' || c.status === 'error').length,
    draft: companies.filter((c) => c.status === 'draft').length,
    learnings: learnings.length,
  };
  const last = runs[0];
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Hide the page until GSAP brings it in; a CSS fallback reveals it if scripts never run. */}
        <script dangerouslySetInnerHTML={{ __html: "if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion')" }} />
      </head>
      <body>
        <Suspense fallback={null}><Motion /></Suspense>
        <div className="shell">
          <aside className="side">
            <Link href="/" className="brand">
              <div className="brand-mark">S</div>
              <div><b>SPRINTO</b><span>OUTREACH</span></div>
            </Link>
            <Nav counts={counts} />
            <div className="side-foot">
              Gemini reads pages and writes. Code decides: every gate is a rule you can point at. Clean drafts send themselves to your inbox; anything unsettled waits for you.
              <div style={{ marginTop: 10, opacity: 0.7 }}>Case-study build · not affiliated with Sprinto</div>
            </div>
          </aside>
          <div className="main">
            <header className="top">
              <div className="grow">
                {last ? <>Last run #{last.id} · {last.status} · {ago(last.created_at)}</> : 'No runs yet'}
              </div>
              <span className="chip"><span className={`dot ${aiConfigured() ? 'ok' : 'off'}`} /> Gemini</span>
              <span className="chip"><span className={`dot ${process.env.HUNTER_API_KEY ? 'ok' : 'off'}`} /> {process.env.HUNTER_API_KEY ? 'Hunter' : 'Contacts file'}</span>
              <span className="chip"><span className={`dot ${gmailConfigured() ? 'ok' : 'off'}`} /> Gmail</span>
              <span className="chip"><span className={`dot ${process.env.DATABASE_URL ? 'ok' : 'off'}`} /> {storageMode()}</span>
              <Link href="/run" className="btn primary">▶ Run pipeline</Link>
            </header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
