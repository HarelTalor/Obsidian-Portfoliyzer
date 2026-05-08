"use client";

import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { LayoutDashboard, Target, Settings, TrendingUp, DollarSign, PieChart } from "lucide-react";

// Placeholder data for the chart
const data = [
  { name: "Jan", value: 4000 },
  { name: "Feb", value: 3000 },
  { name: "Mar", value: 5000 },
  { name: "Apr", value: 4500 },
  { name: "May", value: 6000 },
  { name: "Jun", value: 5500 },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("tab1");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
              <span className="font-bold text-xl tracking-tight">Obsidian Portfoliyzer</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                <span className="text-sm font-medium">U</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-zinc-200/50 dark:bg-zinc-800/50 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveTab("tab1")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "tab1"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab("tab2")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "tab2"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            <Target className="h-4 w-4" />
            Targets
          </button>
          <button
            onClick={() => setActiveTab("tab3")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "tab3"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 sm:p-8 overflow-hidden">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === "tab1" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h2 className="text-2xl font-bold mb-6">Portfolio Overview</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
                  <span className="text-sm text-zinc-500 flex items-center gap-1"><DollarSign className="h-4 w-4"/> Total Balance</span>
                  <span className="text-3xl font-bold">$24,500.00</span>
                  <span className="text-xs text-emerald-500 font-medium">+2.4% today</span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
                  <span className="text-sm text-zinc-500 flex items-center gap-1"><Target className="h-4 w-4"/> DCA Target</span>
                  <span className="text-3xl font-bold">$1,000.00</span>
                  <span className="text-xs text-zinc-500 font-medium">Monthly allocation</span>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
                  <span className="text-sm text-zinc-500 flex items-center gap-1"><PieChart className="h-4 w-4"/> Assets</span>
                  <span className="text-3xl font-bold">12</span>
                  <span className="text-xs text-zinc-500 font-medium">Active positions</span>
                </div>
              </div>

              <div className="h-[400px] w-full mt-4">
                <h3 className="text-sm font-semibold mb-4 text-zinc-600 dark:text-zinc-400">Historical Value</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#3f3f46" opacity={0.2} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} dx={-10} tickFormatter={(val) => `$${val}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#10b981' }}
                    />
                    <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 8, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* TAB 2: TARGETS */}
          {activeTab === "tab2" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Portfolio Targets</h2>
                <button className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                  + Add Asset
                </button>
              </div>
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Asset</th>
                      <th className="px-4 py-3 font-medium">Target %</th>
                      <th className="px-4 py-3 font-medium">Current %</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors">
                      <td className="px-4 py-3 font-medium">AAPL</td>
                      <td className="px-4 py-3">40%</td>
                      <td className="px-4 py-3">38%</td>
                      <td className="px-4 py-3 text-right text-emerald-500 font-medium">Buy</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors">
                      <td className="px-4 py-3 font-medium">BTC-USD</td>
                      <td className="px-4 py-3">20%</td>
                      <td className="px-4 py-3">25%</td>
                      <td className="px-4 py-3 text-right text-rose-500 font-medium">Sell</td>
                    </tr>
                    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50 transition-colors">
                      <td className="px-4 py-3 font-medium">VOO</td>
                      <td className="px-4 py-3">40%</td>
                      <td className="px-4 py-3">37%</td>
                      <td className="px-4 py-3 text-right text-emerald-500 font-medium">Buy</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeTab === "tab3" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-xl">
              <h2 className="text-2xl font-bold mb-6">Settings</h2>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Monthly DCA Budget ($)</label>
                  <input 
                    type="number" 
                    defaultValue={1000}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-xs text-zinc-500">How much do you plan to invest every month?</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Alert Preferences (Resend)</label>
                  <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-3">
                    <input type="checkbox" defaultChecked className="rounded text-emerald-500 focus:ring-emerald-500 bg-zinc-800 border-zinc-700" />
                    <span className="text-sm">Receive email alerts for DCA rebalancing</span>
                  </div>
                </div>

                <button className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-6 py-2 rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
