import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { FALLBACK_FORM, visibleFields, visibleValues } from '../../lib/form';
import type { FormSubmission, FormValue, Member, Occupation } from '../../lib/types';
import { useSessionStore } from './store';

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

const blankMember = (first: boolean): Member => ({
  id: newId(),
  relation: first ? 'self' : 'other',
  age: Number.NaN,
  sex: 'female',
});

/** The form definition from the server (questions and occupations); a built-in copy until then. */
export function useFormDefinition() {
  const query = useQuery({
    queryKey: ['form'],
    queryFn: async () => (await api.getForm()).data,
    placeholderData: FALLBACK_FORM,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  return query.data ?? FALLBACK_FORM;
}

/** Members, their occupation and the follow-up questions that depend on them. */
export function useHouseholdForm() {
  const def = useFormDefinition();
  const stored = useSessionStore((s) => s.members);
  const setMembers = useSessionStore((s) => s.setMembers);
  const values = useSessionStore((s) => s.formValues);
  const setValues = useSessionStore((s) => s.setFormValues);
  const [started] = useState(() => stored.length === 0);
  const [firstBlank] = useState(() => blankMember(true));
  const [showErrors, setShowErrors] = useState(false);

  // A new session starts with one empty person so the form is never blank.
  const members = useMemo(
    () => (started && stored.length === 0 ? [firstBlank] : stored),
    [started, stored, firstBlank],
  );

  const shown = useMemo(() => visibleFields(def, members, values), [def, members, values]);

  const update = (id: string, patch: Partial<Member>) =>
    setMembers(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const add = () => setMembers([...members, blankMember(members.length === 0)]);
  const remove = (id: string) => setMembers(members.filter((m) => m.id !== id));

  const setMemberValue = (memberId: string, fact: string, value: FormValue | undefined) => {
    const current = { ...(values.byMember[memberId] ?? {}) };
    if (value === undefined) delete current[fact];
    else current[fact] = value;
    setValues({ ...values, byMember: { ...values.byMember, [memberId]: current } });
  };
  const setHouseholdValue = (fact: string, value: FormValue | undefined) => {
    const next = { ...values.household };
    if (value === undefined) delete next[fact];
    else next[fact] = value;
    setValues({ ...values, household: next });
  };

  const ageOk = (m: Member) => Number.isInteger(m.age) && m.age >= 0 && m.age <= 120;
  const valid = members.length > 0 && members.every(ageOk);

  /** The payload to send, or null (and errors shown) while something is incomplete. */
  const build = (): FormSubmission | null => {
    if (!valid) {
      setShowErrors(true);
      return null;
    }
    if (stored.length === 0) setMembers(members);
    return { members, ...visibleValues(def, members, values) };
  };

  return {
    def,
    members,
    values,
    shown,
    showErrors,
    ageOk,
    update,
    add,
    remove,
    setMemberValue,
    setHouseholdValue,
    build,
    occupations: def.occupations,
  };
}

export type { Occupation };
