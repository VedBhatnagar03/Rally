import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 640 }}>
      <h1 style={{ marginBottom: 4 }}>Rally</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Activity-first dating at UIUC.
      </p>
      <p>
        Suri owns this page and the real golden path. Backend testing lives at{' '}
        <Link href="/dev">/dev</Link>.
      </p>
    </main>
  );
}
