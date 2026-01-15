import { Link } from 'react-router-dom';
import { Scale, FileText, Users, Shield, Lock, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
            {/* 1. Hero Section (Above the Fold) */}
            <section className="bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-950 border-b border-blue-800">
                <div className="max-w-5xl mx-auto px-6 py-20">
                    <div className="text-center max-w-3xl mx-auto">
                        {/* Platform Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-sm text-white mb-8 border border-white/30">
                            <Scale className="w-4 h-4" />
                            <span className="font-medium">AI-Assisted Dispute Resolution Platform</span>
                        </div>

                        {/* Primary Headline */}
                        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
                            Resolve Disputes Fairly Through AI-Guided Mediation
                        </h1>

                        {/* Supporting Statement - Single, Powerful Line */}
                        <p className="text-xl text-blue-50 mb-10 leading-relaxed">
                            A structured dispute resolution platform that assists parties in reaching fair, transparent, and balanced settlements using AI, guided by Indian Constitutional principles.
                        </p>

                        {/* CTAs - Primary and Secondary */}
                        <div className="flex flex-col sm:flex-row justify-center gap-4">
                            <Link
                                to="/login"
                                className="px-8 py-4 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors shadow-lg text-lg"
                            >
                                Start Resolution
                            </Link>
                            <a
                                href="#how-it-works"
                                className="px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 backdrop-blur-sm transition-colors text-lg"
                            >
                                How It Works
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. What This Platform Does (Purpose Section) */}
            <section className="py-16 bg-slate-900">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-blue-100 mb-4">
                            A Smarter Way to Resolve Disputes
                        </h2>
                    </div>

                    <div className="space-y-6 text-lg text-blue-200 leading-relaxed">
                        <p>
                            Enables individuals and organizations to resolve disputes through a neutral, AI-assisted mediation process.
                        </p>
                        <p>
                            Ensures both parties are heard equally, with structured statements and documented evidence.
                        </p>
                        <p>
                            Generates balanced settlement recommendations, focused on fairness rather than advantage.
                        </p>
                    </div>
                </div>
            </section>

            {/* 3. Resolution Process (Core Value Section) */}
            <section id="how-it-works" className="py-16 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
                <div className="max-w-5xl mx-auto px-6">
                    {/* Section Header */}
                    <div className="text-center mb-4">
                        <h2 className="text-3xl font-bold text-blue-100 mb-3">
                            Structured Resolution Process
                        </h2>
                        <p className="text-lg text-blue-300">
                            A simple, transparent, four-step approach designed to ensure fairness for all parties.
                        </p>
                    </div>

                    {/* Process Steps */}
                    <div className="mt-12 space-y-8">
                        {/* Step 1 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-8 hover:border-blue-600 transition-all backdrop-blur-sm">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                                    <FileText className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-blue-100">Step 1 — File a Case</h3>
                                    </div>
                                    <p className="text-blue-300 leading-relaxed">
                                        Submit dispute details, supporting documents, and expectations in a structured format.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-8 hover:border-blue-600 transition-all backdrop-blur-sm">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                                    <Users className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-blue-100">Step 2 — Party Review & Acceptance</h3>
                                    </div>
                                    <p className="text-blue-300 leading-relaxed">
                                        The respondent reviews the dispute and confirms participation in the mediation process.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-8 hover:border-blue-600 transition-all backdrop-blur-sm">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                                    <Scale className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-blue-100">Step 3 — AI-Assisted Analysis</h3>
                                    </div>
                                    <p className="text-blue-300 leading-relaxed">
                                        The system analyzes statements from both sides, identifies key issues, and generates a fair, neutral resolution recommendation guided by constitutional principles.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Step 4 */}
                        <div className="bg-slate-800/50 border border-blue-800 rounded-lg p-8 hover:border-blue-600 transition-all backdrop-blur-sm">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                                    <CheckCircle className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-blue-100">Step 4 — Resolution & Agreement</h3>
                                    </div>
                                    <p className="text-blue-300 leading-relaxed">
                                        Parties review the recommendation, negotiate if required, and finalize a mutually acceptable outcome.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. What Makes This Platform Trustworthy (Trust Section) */}
            <section className="py-16 bg-gradient-to-r from-slate-800 via-blue-950 to-slate-800 border-y border-blue-800">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-blue-100 mb-3">
                            Built on Fairness, Security, and Transparency
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-10">
                        {/* Neutral & Fair */}
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                                <Scale className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-blue-100 mb-3">Neutral & Fair</h3>
                            <p className="text-blue-300 leading-relaxed">
                                AI does not take sides. Every resolution is based on balanced analysis of both parties' submissions.
                            </p>
                        </div>

                        {/* Secure & Confidential */}
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                                <Lock className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-blue-100 mb-3">Secure & Confidential</h3>
                            <p className="text-blue-300 leading-relaxed">
                                All communications and documents are protected using end-to-end encryption and access control.
                            </p>
                        </div>

                        {/* Constitutionally Guided */}
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-blue-100 mb-3">Constitutionally Guided</h3>
                            <p className="text-blue-300 leading-relaxed">
                                Recommendations are aligned with Indian Constitutional values, ensuring ethical and lawful reasoning.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. What This Platform Is — and Is Not (Clarity Section) */}
            <section className="py-16 bg-amber-950/20 border-y border-amber-900/30">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-bold text-amber-100 mb-3">
                            Clear Scope & Responsible Use
                        </h2>
                    </div>

                    <div className="space-y-4 text-lg text-amber-200 leading-relaxed">
                        <p className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                            <span>This platform provides AI-assisted mediation, not judicial decisions.</span>
                        </p>
                        <p className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                            <span>Generated outcomes are recommendations, not legally binding judgments.</span>
                        </p>
                        <p className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                            <span>Parties retain full freedom to accept, reject, or seek legal remedies outside the platform.</span>
                        </p>
                        <p className="flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400 mt-1 flex-shrink-0" />
                            <span>When mutual agreement is not possible, disputes may be escalated to appropriate legal authorities.</span>
                        </p>
                    </div>
                </div>
            </section>

            {/* 6. Primary Call to Action (Conversion Section) */}
            <section className="py-16 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950">
                <div className="max-w-3xl mx-auto text-center px-6">
                    <h2 className="text-3xl font-bold text-white mb-4">
                        Begin Your Resolution Process
                    </h2>
                    <p className="text-xl text-blue-200 mb-8">
                        Start a structured, fair, and confidential mediation process today.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block px-10 py-4 bg-white text-blue-700 font-bold rounded-lg hover:bg-blue-50 transition-all shadow-xl text-lg"
                    >
                        Access Platform
                    </Link>
                </div>
            </section>

            {/* 7. Support Entry Point (Minimal) */}
            <section className="py-12 bg-slate-900 border-t border-blue-900/30">
                <div className="max-w-3xl mx-auto text-center px-6">
                    <h2 className="text-2xl font-bold text-white mb-3">
                        Need Assistance?
                    </h2>
                    <p className="text-blue-300 mb-6">
                        Have questions about the process or platform usage?<br />
                        Our support team is available to guide you.
                    </p>
                    <Link
                        to="/contact"
                        className="inline-flex items-center gap-2 px-6 py-3 border-2 border-blue-600 text-blue-400 font-medium rounded-lg hover:bg-blue-600/10 transition-colors"
                    >
                        <HelpCircle className="w-5 h-5" />
                        Contact Support
                    </Link>
                </div>
            </section>

            {/* 8. Footer (Essential Only) */}
            <footer className="bg-gradient-to-b from-slate-950 to-black py-8 border-t border-slate-800">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-blue-300 mb-6">
                        <p>© 2026 AI Dispute Resolution Platform. All rights reserved.</p>
                        <div className="flex gap-6">
                            <Link to="/privacy" className="hover:text-blue-400 transition-colors">Privacy Policy</Link>
                            <Link to="/terms" className="hover:text-blue-400 transition-colors">Terms of Service</Link>
                            <Link to="/legal" className="hover:text-blue-400 transition-colors">Legal Notice</Link>
                        </div>
                    </div>

                    {/* Footer Disclaimer */}
                    <div className="pt-6 border-t border-slate-800 text-center">
                        <p className="text-xs text-blue-400/80">
                            AI-assisted platform guided by Indian Constitutional principles. Not a substitute for professional legal advice.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
