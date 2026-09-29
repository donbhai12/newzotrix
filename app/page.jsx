'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../client/src/App.jsx'), {
  ssr: false,
  loading: () => (
    <div className="screen-loader">
      <div className="loader-dot" />
      <b>Loading Zotrix Research Private Ltd...</b>
    </div>
  )
});

export default function HomePage() {
  return <App />;
}