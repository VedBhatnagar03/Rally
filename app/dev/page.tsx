'use client';

/**
 * BACKEND TEST HARNESS — Ved. Not the product, not Suri's design.
 *
 * Walks the golden path against whichever RallyApi implementation is active
 * so backend changes can be verified in a browser before the real UI exists.
 * Delete before the demo.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { CandidateMatch, Rally, ScheduleOption, UserProfile } from '@/types';

const box: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

const btn: React.CSSProperties = {
  padding: '6px 12px',
  marginRight: 8,
  marginTop: 8,
  borderRadius: 6,
  border: '1px solid #0b6',
  background: '#0b6',
  color: 'white',
  cursor: 'pointer',
};

const ghost: React.CSSProperties = {
  ...btn,
  background: 'white',
  color: '#0b6',
};

const chip: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 7px',
  marginRight: 4,
  borderRadius: 10,
  background: '#eef',
  color: '#334',
  fontSize: 11,
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const BLOCKS = ['morning', 'afternoon', 'evening'] as const;

function Attributes({
  profile,
  highlight,
}: {
  profile: UserProfile;
  highlight?: UserProfile | null;
}) {
  const theirSlots = new Set(
    (highlight?.availability ?? []).map((a) => `${a.day}:${a.block}`),
  );
  const theirSports = new Set((highlight?.sports ?? []).map((s) => s.sport));
  const p = profile.preferences;

  return (
    <div style={{ fontSize: 12, color: '#444' }}>
      <div style={{ marginBottom: 4 }}>
        {profile.age} · {profile.year} · {profile.major}
      </div>
      <div style={{ marginBottom: 4 }}>
        <span style={chip}>{p.gender}</span>
        <span style={chip}>into {p.interestedIn}</span>
        <span style={chip}>{p.intent}</span>
        <span style={chip}>
          age {p.ageMin}–{p.ageMax}
        </span>
      </div>
      <div style={{ marginBottom: 4 }}>
        {profile.sports.map((s) => (
          <span
            key={s.sport}
            style={{
              ...chip,
              background: theirSports.has(s.sport) ? '#cfc' : '#eee',
              fontWeight: theirSports.has(s.sport) ? 600 : 400,
            }}
          >
            {s.sport} · {s.skill}
          </span>
        ))}
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
        <tbody>
          {BLOCKS.map((block) => (
            <tr key={block}>
              <td style={{ paddingRight: 6, color: '#888' }}>
                {block.slice(0, 3)}
              </td>
              {DAYS.map((day) => {
                const has = profile.availability.some(
                  (a) => a.day === day && a.block === block,
                );
                const both = has && theirSlots.has(`${day}:${block}`);
                return (
                  <td
                    key={day}
                    title={`${day} ${block}`}
                    style={{
                      width: 20,
                      height: 14,
                      textAlign: 'center',
                      border: '1px solid #eee',
                      background: both ? '#0b6' : has ? '#cfc' : 'transparent',
                      color: both ? 'white' : '#999',
                    }}
                  >
                    {day.slice(0, 1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Breakdown({ match }: { match: CandidateMatch }) {
  if (!match.breakdown) return null;
  return (
    <table
      style={{
        fontSize: 11,
        borderCollapse: 'collapse',
        marginTop: 6,
        width: '100%',
        maxWidth: 520,
      }}
    >
      <thead>
        <tr style={{ color: '#888', textAlign: 'left' }}>
          <th>component</th>
          <th>weight</th>
          <th>raw</th>
          <th>= weighted</th>
          <th>why</th>
        </tr>
      </thead>
      <tbody>
        {match.breakdown.map((c) => (
          <tr key={c.label} style={{ borderTop: '1px solid #f0f0f0' }}>
            <td>{c.label}</td>
            <td style={{ color: '#888' }}>{c.weight}</td>
            <td style={{ color: '#888' }}>{c.raw}</td>
            <td style={{ fontWeight: 600 }}>{c.weighted.toFixed(3)}</td>
            <td style={{ color: '#666' }}>{c.detail}</td>
          </tr>
        ))}
        <tr style={{ borderTop: '2px solid #ddd' }}>
          <td colSpan={3} style={{ textAlign: 'right', paddingRight: 8 }}>
            total
          </td>
          <td style={{ fontWeight: 700, color: '#0b6' }}>
            {match.score.toFixed(2)}
          </td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}

export default function DevHarness() {
  const [log, setLog] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [viewer, setViewer] = useState<UserProfile | null>(null);
  const [candidates, setCandidates] = useState<CandidateMatch[]>([]);
  const [rally, setRally] = useState<Rally | null>(null);
  const [slots, setSlots] = useState<ScheduleOption[]>([]);
  const [busy, setBusy] = useState(false);

  const say = useCallback((msg: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev]);
  }, []);

  const loadProfiles = useCallback(async () => {
    setBusy(true);
    const res = await fetch('/api/dev/profiles').then((r) => r.json());
    setBusy(false);
    if (!res.ok) {
      say(`FAIL listing profiles: ${res.error}`);
      return;
    }
    setProfiles(res.data);
    say(`Loaded ${res.data.length} profiles.`);
  }, [say]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  async function pickViewer(id: string) {
    setBusy(true);
    const res = await api.getProfile(id);
    setBusy(false);
    if (!res.ok) return say(`FAIL getProfile: ${res.error}`);
    setViewer(res.data);
    setCandidates([]);
    setRally(null);
    setSlots([]);
    say(`Viewing as ${res.data.firstName}.`);
  }

  async function loadCandidates() {
    if (!viewer) return;
    setBusy(true);
    const res = await api.getCandidates(viewer.id);
    setBusy(false);
    if (!res.ok) return say(`FAIL getCandidates: ${res.error}`);
    setCandidates(res.data);
    say(`${res.data.length} candidates after hard filters.`);
  }

  async function sendAndAccept(candidate: CandidateMatch) {
    if (!viewer) return;
    setBusy(true);

    const sport = candidate.sharedSports[0];
    const sent = await api.sendRally(viewer.id, candidate.user.id, sport);
    if (!sent.ok) {
      setBusy(false);
      return say(`FAIL sendRally: ${sent.error}`);
    }
    say(`Rally sent to ${candidate.user.firstName} for ${sport}.`);

    const accepted = await api.respondToRally(sent.data.id, 'accepted');
    setBusy(false);
    if (!accepted.ok) return say(`FAIL respondToRally: ${accepted.error}`);
    if (!accepted.data) return say('Accepted but no Rally returned.');

    setRally(accepted.data);
    say(`Rally created (${accepted.data.id.slice(0, 8)}).`);
  }

  async function loadSlots() {
    if (!rally) return;
    setBusy(true);
    const res = await api.getScheduleOptions(rally.id);
    setBusy(false);
    if (!res.ok) return say(`FAIL getScheduleOptions: ${res.error}`);
    setSlots(res.data);
    say(
      res.data.length === 0
        ? 'No overlapping availability.'
        : `${res.data.length} overlapping slots.`,
    );
  }

  async function choose(option: ScheduleOption) {
    if (!rally) return;
    setBusy(true);
    const res = await api.selectSchedule(rally.id, option);
    setBusy(false);
    if (!res.ok) return say(`FAIL selectSchedule: ${res.error}`);
    setRally(res.data);
    say(`Scheduled ${option.date} ${option.slot.block} at ${option.venue.name}.`);
  }

  async function book() {
    if (!rally || !viewer) return;
    setBusy(true);
    const res = await api.confirmBooking(rally.id, viewer.id);
    setBusy(false);
    if (!res.ok) return say(`FAIL confirmBooking: ${res.error}`);
    setRally(res.data);
    say('Court marked booked.');
  }

  async function finish() {
    if (!rally || !viewer) return;
    setBusy(true);
    const done = await api.completeRally(rally.id);
    if (!done.ok) {
      setBusy(false);
      return say(`FAIL completeRally: ${done.error}`);
    }
    setRally(done.data);

    const other = rally.participantIds.find((p) => p !== viewer.id)!;
    await api.submitFeedback(rally.id, viewer.id, true, 'yes');
    await api.submitFeedback(rally.id, other, true, 'yes');

    const outcome = await api.getRallyOutcome(rally.id);
    setBusy(false);
    if (!outcome.ok) return say(`FAIL getRallyOutcome: ${outcome.error}`);
    say(
      outcome.data.isMutualMatch
        ? 'GAME. SET. MATCH. (mutual yes)'
        : `Outcome: bothResponded=${outcome.data.bothResponded}`,
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ marginBottom: 0 }}>Rally — backend harness</h1>
      <p style={{ color: '#666', marginTop: 4, fontSize: 13 }}>
        Not the product. Verifies the golden path against the live API.
        {busy ? ' — working…' : ''}
      </p>
      <p style={{ fontSize: 11, color: '#888', marginTop: 0 }}>
        Availability grid:{' '}
        <span style={{ ...chip, background: '#cfc' }}>free</span>
        <span style={{ ...chip, background: '#0b6', color: 'white' }}>
          shared with viewer
        </span>
      </p>

      <section style={box}>
        <strong>1. Pick a viewer</strong>
        <div>
          {profiles.length === 0 && (
            <p style={{ color: '#a00' }}>
              No profiles. Run <code>npm run seed</code>, or set{' '}
              <code>NEXT_PUBLIC_RALLY_USE_MOCKS=true</code>.
            </p>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              style={viewer?.id === p.id ? btn : ghost}
              onClick={() => void pickViewer(p.id)}
            >
              {p.firstName}
            </button>
          ))}
        </div>
      </section>

      {viewer && (
        <section style={box}>
          <strong>2. Viewing as {viewer.firstName}</strong>
          <p style={{ fontSize: 12, color: '#666', margin: '4px 0' }}>
            {viewer.bio}
          </p>
          <Attributes profile={viewer} />
        </section>
      )}

      {viewer && (
        <section style={box}>
          <strong>3. Candidates for {viewer.firstName}</strong>
          <div>
            <button style={btn} onClick={() => void loadCandidates()}>
              getCandidates
            </button>
          </div>
          {candidates.map((c, i) => (
            <div
              key={c.user.id}
              style={{ borderTop: '1px solid #eee', paddingTop: 8, marginTop: 8 }}
            >
              <div>
                <span style={{ color: '#999' }}>#{i + 1}</span>{' '}
                <strong>{c.user.firstName}</strong> —{' '}
                <span style={{ color: '#0b6', fontWeight: 700 }}>
                  {c.score.toFixed(2)}
                </span>
              </div>
              <Attributes profile={c.user} highlight={viewer} />
              <ul style={{ margin: '6px 0' }}>
                {c.reasons.map((r) => (
                  <li key={r.text} style={{ color: '#555', fontSize: 12 }}>
                    {r.text}
                  </li>
                ))}
              </ul>
              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#0b6' }}>
                  score math
                </summary>
                <Breakdown match={c} />
              </details>
              <button style={ghost} onClick={() => void sendAndAccept(c)}>
                Send Rally + accept
              </button>
            </div>
          ))}
        </section>
      )}

      {rally && (
        <section style={box}>
          <strong>4. Rally {rally.id.slice(0, 8)}</strong>
          <div style={{ color: '#555' }}>
            status={rally.status} booking={rally.bookingStatus}
            {rally.venue ? ` venue=${rally.venue.name}` : ''}
          </div>
          <div>
            <button style={btn} onClick={() => void loadSlots()}>
              getScheduleOptions
            </button>
            <button style={ghost} onClick={() => void book()}>
              confirmBooking
            </button>
            <button style={ghost} onClick={() => void finish()}>
              complete + feedback
            </button>
          </div>
          {slots.map((s) => (
            <button
              key={`${s.date}-${s.slot.block}`}
              style={ghost}
              onClick={() => void choose(s)}
            >
              {s.date} {s.slot.block} @ {s.venue.name}
            </button>
          ))}
        </section>
      )}

      <section style={box}>
        <strong>Log</strong>
        <pre
          style={{
            maxHeight: 260,
            overflow: 'auto',
            background: '#fafafa',
            padding: 8,
            fontSize: 12,
          }}
        >
          {log.join('\n') || 'Nothing yet.'}
        </pre>
      </section>
    </main>
  );
}
