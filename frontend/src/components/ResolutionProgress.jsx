import React from 'react';
import { CheckCircle, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ResolutionProgress({ steps, currentStep, isCompact, onToggleExpand }) {
    // Compact View
    if (isCompact) {
        return (
            <div className="bg-slate-900/50 border border-blue-900/50 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar mask-linear-fade">
                    {steps.map((step, idx) => {
                        const isCompleted = idx < currentStep;
                        const isCurrent = idx === currentStep;

                        return (
                            <div key={idx} className="flex items-center whitespace-nowrap">
                                <span className={`flex items-center text-xs font-medium ${isCompleted ? 'text-green-400' :
                                        isCurrent ? 'text-blue-200' : 'text-slate-500'
                                    }`}>
                                    {isCompleted ? (
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                    ) : isCurrent ? (
                                        <Circle className="w-3.5 h-3.5 mr-1 fill-blue-500/20 text-blue-400 animate-pulse" />
                                    ) : (
                                        <Circle className="w-3.5 h-3.5 mr-1" />
                                    )}
                                    {step.label}
                                </span>
                                {idx < steps.length - 1 && (
                                    <div className={`h-px w-6 mx-2 ${isCompleted ? 'bg-green-500/30' : 'bg-slate-800'}`} />
                                )}
                            </div>
                        );
                    })}
                </div>
                {onToggleExpand && (
                    <button
                        onClick={onToggleExpand}
                        className="ml-3 p-1 hover:bg-slate-800 rounded text-blue-400 transition-colors"
                        title="Show Full Details"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    }

    // Expanded View (Full visual stepper)
    return (
        <div className="bg-slate-900/50 border border-blue-800 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-blue-100">Resolution Progress</h3>
                {onToggleExpand && (
                    <button
                        onClick={onToggleExpand}
                        className="p-1 hover:bg-slate-800 rounded text-blue-400 transition-colors"
                        title="Show Compact View"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                )}
            </div>

            <div className="relative">
                {/* Connecting Line */}
                <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-800" />

                <div className="space-y-8">
                    {steps.map((step, idx) => {
                        const isCompleted = idx < currentStep;
                        const isCurrent = idx === currentStep;

                        return (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="relative flex items-start"
                            >
                                <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 mr-4 bg-slate-900 ${isCompleted ? 'border-green-500 text-green-400' :
                                        isCurrent ? 'border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' :
                                            'border-slate-700 text-slate-600'
                                    }`}>
                                    {isCompleted ? (
                                        <CheckCircle className="w-6 h-6" />
                                    ) : (
                                        <span className="text-sm font-bold">{idx + 1}</span>
                                    )}
                                </div>

                                <div className="pt-1">
                                    <h4 className={`text-base font-semibold ${isCompleted ? 'text-green-400' :
                                            isCurrent ? 'text-blue-100' :
                                                'text-slate-500'
                                        }`}>
                                        {step.label}
                                    </h4>
                                    <p className="text-sm text-slate-400 mt-1">{step.description}</p>

                                    {isCurrent && (
                                        <div className="mt-2 text-xs px-2 py-1 bg-blue-500/10 text-blue-300 rounded border border-blue-500/20 inline-block">
                                            In Progress
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
