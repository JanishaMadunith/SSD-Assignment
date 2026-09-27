import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-black">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children ?? <Outlet />}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
          <p>© 2026 SUWAPIYASA.LK. All rights reserved.</p>
          <p className="text-[#107393]">AI-Powered Healthcare at Your Fingertips</p>
        </div>
      </footer>
    </div>
  );
}
