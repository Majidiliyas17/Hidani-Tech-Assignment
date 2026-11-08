import { useEffect, useState } from 'react';
import { Briefcase, Check, FileText, Save, ShieldCheck } from 'lucide-react';
import type { ContextValidationResult } from '../../modules/context/validation';
import { CONTEXT_LIMITS } from '../../modules/context/validation';
import type { InterviewContext } from '../../types/protocol';
import { cn, formatChars, formatClock } from '../../utils/format';
import { Button } from '../common/Button';
import { Card, CardHeader } from '../common/Card';

export function ContextPanel({
  savedContext,
  savedAt,
  onSave,
}: {
  savedContext: InterviewContext;
  savedAt: number | null;
  onSave: (draft: InterviewContext) => ContextValidationResult;
}) {
  const [draft, setDraft] = useState<InterviewContext>(savedContext);
  const [errors, setErrors] = useState<ContextValidationResult['errors']>({});
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setDraft(savedContext);
  }, [savedContext]);

  const updateField = (field: keyof InterviewContext, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setJustSaved(false);
  };

  const handleSave = () => {
    const result = onSave(draft);
    setErrors(result.errors);
    setJustSaved(result.valid);
  };

  return (
    <Card>
      <CardHeader
        icon={FileText}
        title="Interview context"
        subtitle="Tailors every answer to the candidate and role"
        action={
          justSaved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
              <Check className="h-3 w-3" /> Saved
            </span>
          ) : null
        }
      />

      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="resume"
              className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200"
            >
              <FileText className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              Resume / professional summary
            </label>
            <span className="text-xs tabular-nums text-zinc-500">
              {formatChars(draft.resume.trim().length)} /{' '}
              {formatChars(CONTEXT_LIMITS.resumeMaxChars)}
            </span>
          </div>
          <textarea
            id="resume"
            value={draft.resume}
            onChange={(event) => updateField('resume', event.target.value)}
            rows={5}
            placeholder="Paste a short resume or professional summary: roles, skills, projects, measurable outcomes…"
            className={cn(
              'w-full resize-y rounded-xl border bg-zinc-950/60 px-4 py-3 text-[15px] leading-7 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2',
              errors.resume
                ? 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20'
                : 'border-zinc-800 focus:border-indigo-500/50 focus:ring-indigo-500/20',
            )}
          />
          {errors.resume ? <p className="mt-1 text-xs text-red-400">{errors.resume}</p> : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="job-description"
              className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200"
            >
              <Briefcase className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
              Job description
            </label>
            <span className="text-xs tabular-nums text-zinc-500">
              {formatChars(draft.jobDescription.trim().length)} /{' '}
              {formatChars(CONTEXT_LIMITS.jobDescriptionMaxChars)}
            </span>
          </div>
          <textarea
            id="job-description"
            value={draft.jobDescription}
            onChange={(event) => updateField('jobDescription', event.target.value)}
            rows={5}
            placeholder="Paste the role description: responsibilities, required skills, seniority…"
            className={cn(
              'w-full resize-y rounded-xl border bg-zinc-950/60 px-4 py-3 text-[15px] leading-7 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2',
              errors.jobDescription
                ? 'border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20'
                : 'border-zinc-800 focus:border-indigo-500/50 focus:ring-indigo-500/20',
            )}
          />
          {errors.jobDescription ? (
            <p className="mt-1 text-xs text-red-400">{errors.jobDescription}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-600" aria-hidden="true" />
            Kept in server memory only · never logged
          </p>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-3.5 w-3.5" />
            Save context
          </Button>
        </div>

        {savedAt ? (
          <p className="text-xs text-zinc-500">
            Last saved at {formatClock(savedAt)}. Updates apply to the next detected question.
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Save both fields before starting a listening session.
          </p>
        )}
      </div>
    </Card>
  );
}
