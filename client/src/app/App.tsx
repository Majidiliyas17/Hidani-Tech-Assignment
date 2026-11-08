import { useEffect, useState } from 'react';
import { AudioLines, Sparkles } from 'lucide-react';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { useInterviewSession } from '../hooks/useInterviewSession';
import { ErrorBanner, NoticeBanner } from '../components/common/ErrorBanner';
import { AnswerPanel } from '../components/interview/AnswerPanel';
import { AudioControls } from '../components/interview/AudioControls';
import { ContextPanel } from '../components/interview/ContextPanel';
import { MetricsPanel } from '../components/interview/MetricsPanel';
import { QuestionPanel } from '../components/interview/QuestionPanel';
import { SetupBanner } from '../components/interview/SetupBanner';
import { TranscriptPanel } from '../components/interview/TranscriptPanel';
import { Header } from '../components/layout/Header';

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const interview = useInterviewSession();
  const { health, refresh } = useHealthCheck();
  const { state } = interview;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#080e1d' : '#eaf1ff');
  }, [isDark]);

  return (
    <div className="min-h-screen">
      <Header
        connection={state.connection}
        session={state.session}
        isDark={isDark}
        onToggleTheme={() => setIsDark((current) => !current)}
      />

      <main className="relative mx-auto max-w-[1500px] px-4 pb-8 sm:px-6">
        <section className="workspace-hero mt-7 px-6 py-7 sm:px-9 sm:py-9 lg:px-11 lg:py-10">
          <span className="hero-orb" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-8">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-white/55 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 shadow-sm dark:bg-slate-950/35 dark:text-indigo-200">
                <Sparkles className="h-3.5 w-3.5" /> Interview workspace
              </p>
              <h2 className="mt-4 max-w-3xl text-3xl font-extrabold leading-[1.12] tracking-[-0.045em] text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">
                Walk into every interview{' '}
                <span className="text-indigo-600 dark:text-sky-300">ready.</span>
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
                Your role context, live conversation, and thoughtful AI suggestions in one focused
                workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span className="rounded-full border border-white/80 bg-white/60 px-3 py-1.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                  01&nbsp; Prepare your context
                </span>
                <span className="rounded-full border border-white/80 bg-white/60 px-3 py-1.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                  02&nbsp; Start listening
                </span>
              </div>
            </div>
            <div className="hidden shrink-0 md:block" aria-hidden="true">
              <div className="rounded-[1.75rem] border border-white/70 bg-white/45 p-5 shadow-xl shadow-blue-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/30">
                <div className="flex items-center justify-between gap-8">
                  <span className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <AudioLines className="h-4 w-4 text-indigo-500 dark:text-sky-300" /> Live audio
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]" />
                </div>
                <div className="hero-bars mt-6 flex h-20 items-center justify-center gap-2">
                  {[24, 42, 58, 32, 72, 48, 86, 56, 38, 68, 45, 26].map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} className="opacity-90" />
                  ))}
                </div>
                <p className="mt-4 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                  Listen · Understand · Respond
                </p>
              </div>
            </div>
          </div>
        </section>
        <SetupBanner health={health} onRetry={() => void refresh()} />
        <ErrorBanner error={state.error} onDismiss={interview.dismissError} />
        <NoticeBanner message={state.notice} onDismiss={interview.dismissNotice} />

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-4">
            <ContextPanel
              savedContext={interview.savedContext}
              savedAt={interview.savedAt}
              onSave={interview.saveContext}
            />

            <AudioControls
              connection={state.connection}
              session={state.session}
              isStarting={interview.isStarting}
              isLive={interview.isLive}
              source={interview.source}
              includeMicrophoneWithTab={interview.includeMicrophoneWithTab}
              tabSupported={interview.tabSupported}
              contextReady={interview.contextReady}
              captureError={interview.captureError}
              onSourceChange={interview.setSource}
              onIncludeMicrophoneWithTabChange={interview.setIncludeMicrophoneWithTab}
              onStart={() => void interview.startListening()}
              onStop={() => void interview.stopListening()}
            />

            <MetricsPanel metrics={state.metrics} />
          </div>

          <div className="space-y-5 xl:col-span-8">
            <QuestionPanel
              question={state.currentQuestion}
              questionCount={state.questions.length}
              session={state.session}
              hasInterim={state.interim.length > 0}
              isThinking={interview.activeAnswer?.status === 'streaming'}
            />

            <AnswerPanel answers={state.answers} activeAnswerId={state.activeAnswerId} />

            <TranscriptPanel
              finals={state.finals}
              interim={state.interim}
              listening={interview.isLive}
            />
          </div>
        </div>

        <footer className="mt-8 flex flex-col gap-2 border-t border-zinc-800/60 py-5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Deepgram real-time STT → Node.js session orchestration → Groq streaming LLM.</span>
          <span>
            API keys stay server-side · resume/audio are never logged · audio is not persisted.
          </span>
        </footer>
      </main>
    </div>
  );
}
