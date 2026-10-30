import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Globe, Lock, Plus, Search, Users } from 'lucide-react';
import { api } from '../lib/api';
import { errorText, useApp } from '../lib/app';
import type { Group, Profile, Visibility } from '../lib/types';
import { normalizeSearch } from '../lib/util';
import { Sheet } from './Sheet';

export interface AudienceValue {
  visibility: Visibility;
  allowed_users: string[];
  allowed_groups: string[];
}

export const VIS_ICON: Record<Visibility, typeof Globe> = { public: Globe, private: Lock, restricted: Users };

function usePeopleAndGroups(open: boolean) {
  const [people, setPeople] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  useEffect(() => {
    if (!open) return;
    api.listPeople().then(setPeople).catch(() => {});
    api.listGroups().then(setGroups).catch(() => {});
  }, [open]);
  return { people, groups, setGroups };
}

/** Searchable checklist of people. */
export function PeoplePicker({ people, selected, onToggle }: { people: Profile[]; selected: string[]; onToggle: (id: string) => void }) {
  const { t } = useApp();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const n = normalizeSearch(q);
    const list = n ? people.filter((p) => normalizeSearch(`${p.display_name} ${p.username}`).includes(n)) : people;
    // Selected people first so they're easy to review.
    return [...list].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  }, [people, q, selected]);
  return (
    <div className="picker">
      <div className="picker-search">
        <Search size={16} />
        <input dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPeople')} />
      </div>
      <ul className="picker-list">
        {shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button type="button" className={on ? 'on' : ''} onClick={() => onToggle(p.id)} aria-pressed={on}>
                <span className="avatar sm">{p.display_name.slice(0, 1)}</span>
                <span className="grow">
                  <span dir="auto">{p.display_name}</span>{' '}
                  <small className="muted" dir="ltr">
                    @{p.username}
                  </small>
                </span>
                <span className="tick">{on && <Check size={16} />}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AudienceSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: AudienceValue;
  onChange: (v: AudienceValue) => void;
}) {
  const { t } = useApp();
  const { people, groups, setGroups } = usePeopleAndGroups(open);
  const [creating, setCreating] = useState(false);
  const toggle = (key: 'allowed_users' | 'allowed_groups', id: string) => {
    const cur = value[key];
    onChange({ ...value, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('audience')}>
      <div className="form">
        <div className="vis-options">
          {(['public', 'private', 'restricted'] as const).map((v) => {
            const Icon = VIS_ICON[v];
            return (
              <button type="button" key={v} className={`vis-opt${value.visibility === v ? ' on' : ''}`} onClick={() => onChange({ ...value, visibility: v })}>
                <Icon size={20} />
                <strong>{t(`vis_${v}`)}</strong>
                <small>{t(`visHelp_${v}`)}</small>
              </button>
            );
          })}
        </div>

        {value.visibility === 'restricted' && (
          <>
            <fieldset>
              <legend>{t('groups')}</legend>
              {groups.length ? (
                <div className="chips">
                  <button type="button" className="chip" onClick={() => setCreating(true)}>
                    <Plus size={14} /> {t('newGroup')}
                  </button>
                  {groups.map((g) => (
                    <button type="button" key={g.id} className={`chip${value.allowed_groups.includes(g.id) ? ' on' : ''}`} onClick={() => toggle('allowed_groups', g.id)}>
                      <Users size={14} /> {g.name} <small className="muted">{g.member_ids.length}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="chips">
                  <button type="button" className="chip" onClick={() => setCreating(true)}>
                    <Plus size={14} /> {t('newGroup')}
                  </button>
                  <span className="hint">{t('noGroups')}</span>
                </div>
              )}
              <Link to="/admin?tab=groups" className="hint" target="_blank">
                {t('manageGroups')} ↗
              </Link>
            </fieldset>
            <fieldset>
              <legend>{t('people')}</legend>
              <PeoplePicker people={people} selected={value.allowed_users} onToggle={(id) => toggle('allowed_users', id)} />
            </fieldset>
          </>
        )}
        <div className="row end">
          <button type="button" className="btn primary" onClick={onClose}>
            {t('save')}
          </button>
        </div>
      </div>
      <GroupSheet
        open={creating}
        group={null}
        onClose={() => setCreating(false)}
        onSaved={(g) => {
          // Add the new group and share this post with it right away.
          setGroups((gs) => [...gs, g].sort((a, b) => a.name.localeCompare(b.name)));
          onChange({ ...value, allowed_groups: [...value.allowed_groups, g.id] });
        }}
      />
    </Sheet>
  );
}

/** Create / edit a group: name, description and members. */
export function GroupSheet({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: Group | null;
  onClose: () => void;
  onSaved: (g: Group) => void;
}) {
  const { t, toast } = useApp();
  const { people } = usePeopleAndGroups(open);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [members, setMembers] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setDesc(group?.description ?? '');
    setMembers(group?.member_ids ?? []);
  }, [open, group]);

  return (
    <Sheet open={open} onClose={onClose} title={group ? group.name : t('newGroup')}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const saved = await api.saveGroup({ id: group?.id, name, description: desc, member_ids: members });
            onSaved(saved);
            onClose();
          } catch (err) {
            toast(errorText(err, t));
          }
        }}
      >
        <label>
          {t('groupName')}
          <input dir="auto" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('groupDesc')}
          <input dir="auto" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <fieldset>
          <legend>
            {t('people')} · {members.length}
          </legend>
          <PeoplePicker people={people} selected={members} onToggle={(id) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))} />
        </fieldset>
        <div className="row end">
          <button className="btn primary" disabled={!name.trim()}>
            {t('save')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
