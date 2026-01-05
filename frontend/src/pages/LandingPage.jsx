import { Link } from 'react-router-dom';
import { Scale, FileText, Users, Shield, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
            {/* Hero Section - Reduced Height, Minimal Design */}
            <section className="bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-950 border-b border-blue-800">
                <div className="max-w-5xl mx-auto px-6 py-16">
                    <div className="text-center max-w-3xl mx-auto">
                        {/* Trust Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm text-white mb-6 border border-white/30">
                            <Scale className="w-4 h-4" />
                            <span className="font-medium">AI-Assisted Dispute Resolution Platform</span>
                        </div>

                        {/* Main Headline - Clear Typography Hierarchy */}
                        <h1 className="text-4xl md:text-5xl font-semibold text-white mb-5 tracking-tight leading-tight">
                            Resolve Disputes Through AI-Powered Mediation
                        </h1>

                        {/* Value Statement - Single, Concise */}
                        <p className="text-lg text-blue-50 mb-8 leading-relaxed">
                            A structured platform for conflict resolution guided by Indian Constitutional principles. 
                            Fair, transparent, and efficient dispute mediation with AI assistance.
                        </p>

                        {/* CTAs - Primary and Secondary */}
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <Link
                                to="/login"
                                className="px-7 py-3 bg-white text-blue-700 font-medium rounded-lg hover:bg-blue-50 transition-colors shadow-lg"
                            >
                                Start Dispute Resolution
                            </Link>
                            <a
                                href="#how-it-works"
                                className="px-7 py-3 border-2 border-white/30 text-white font-medium rounded-lg hover:bg-white/10 backdrop-blur-sm transition-colors"
                            >
                                How It Works
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works - Horizontal Flow, Uniform Cards */}
            <section id="how-it-works" className="py-16 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
                <div className="max-w-5xl mx-auto px-6">
                    {/* Section Header */}
                    <div className="text-center mb-12">
                        <h2 className="text-2xl font-semibold text-blue-100 mb-3">Resolution Process</h2>
                        <p className="text-blue-300">A systematic four-step approach to fair dispute resolution</p>
                    </div>

                    {/* Process Steps - Horizontal Flow */}
                    <div className="grid md:grid-cols-4 gap-6">
                        {/* Step 1 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-6 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/30 transition-all backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                                    <FileText className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-xs font-semibold text-blue-400">STEP 1</span>
                            </div>
                            <h3 className="text-base font-semibold text-blue-100 mb-2">File Case</h3>
                            <p className="text-sm text-blue-300 leading-relaxed">Submit dispute details with required documentation</p>
                        </div>

                        {/* Step 2 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-6 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/30 transition-all backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                                    <Users className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-xs font-semibold text-blue-400">STEP 2</span>
                            </div>
                            <h3 className="text-base font-semibold text-blue-100 mb-2">Party Acceptance</h3>
                            <p className="text-sm text-blue-300 leading-relaxed">Respondent reviews and accepts participation</p>
                        </div>

                        {/* Step 3 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-6 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/30 transition-all backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                                    <Scale className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-xs font-semibold text-blue-400">STEP 3</span>
                            </div>
                            <h3 className="text-base font-semibold text-blue-100 mb-2">AI Analysis</h3>
                            <p className="text-sm text-blue-300 leading-relaxed">Constitutional law-based solution generation</p>
                        </div>

                        {/* Step 4 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-6 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/30 transition-all backdrop-blur-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                                    <CheckCircle className="w-5 h-5 text-white" />
                                </div>
                                <span className="text-xs font-semibold text-blue-400">STEP 4</span>
                            </div>
                            <h3 className="text-base font-semibold text-blue-100 mb-2">Resolution</h3>
                            <p className="text-sm text-blue-300 leading-relaxed">Parties agree and finalize settlement terms</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Trust Signals Section */}
            <section className="py-12 bg-gradient-to-r from-slate-800 via-blue-950 to-slate-800 border-y border-blue-800">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Security */}
                        <div className="flex items-start gap-3">
                            <Lock className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-semibold text-blue-100 mb-1">Secure & Confidential</h3>
                                <p className="text-sm text-blue-300">End-to-end encryption for all communications and documents</p>
                            </div>
                        </div>

                        {/* Legal Basis */}
                        <div className="flex items-start gap-3">
                            <Scale className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-semibold text-blue-100 mb-1">Constitutional Framework</h3>
                                <p className="text-sm text-blue-300">AI decisions guided by Indian Constitutional Law principles</p>
                            </div>
                        </div>

                        {/* Privacy */}
                        <div className="flex items-start gap-3">
                            <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <h3 className="text-sm font-semibold text-blue-100 mb-1">Privacy Protected</h3>
                                <p className="text-sm text-blue-300">Full compliance with data protection and privacy regulations</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Legal Disclaimer */}
            <section className="py-10 bg-amber-950/30 border-y border-amber-900/50">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="flex items-start gap-4">
                        <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                            <h3 className="text-sm font-semibold text-amber-200 mb-2">Important Legal Notice</h3>
                            <p className="text-sm text-amber-300 leading-relaxed">
                                This platform provides AI-assisted mediation and is not a substitute for professional legal advice. 
                                Solutions generated are recommendations based on constitutional principles and do not constitute 
                                legally binding judgments. For matters requiring legal representation or court proceedings, 
                                consult a qualified legal professional. Cases may be forwarded to appropriate judicial authorities 
                                when parties cannot reach agreement.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Bottom CTA - Minimal, Confident */}
            <section className="py-14 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950">
                <div className="max-w-3xl mx-auto text-center px-6">
                    <h2 className="text-2xl font-semibold text-white mb-3">
                        Begin Resolution Process
                    </h2>
                    <p className="text-blue-200 mb-6">
                        Access the platform to file your dispute and initiate structured mediation
                    </p>
                    <Link
                        to="/login"
                        className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg"
                    >
                        Access Platform
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gradient-to-b from-slate-950 to-black py-8">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-blue-300">
                        <p>© 2026 AI Dispute Resolution Platform. All rights reserved.</p>
                        <div className="flex gap-6">
                            <a href="#" className="hover:text-blue-400 transition-colors">Privacy Policy</a>
                            <a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a>
                            <a href="#" className="hover:text-blue-400 transition-colors">Legal</a>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                        <p className="text-xs text-blue-400">
                            AI-assisted platform guided by Indian Constitutional Law. Not a replacement for legal counsel.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
