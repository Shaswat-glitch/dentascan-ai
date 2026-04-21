import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, Activity, Shield, AlertTriangle, ShieldCheck, Microscope, DatabaseZap, CheckCircle2, Info } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export default function App() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const processFile = (file) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    setError(null);
    setResults(null);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
      setImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: image }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message || 'Failed to connect to the analysis server.');
    } finally {
      setLoading(false);
    }
  };

  const getGaugeColor = (score) => {
    if (score >= 80) return '#27ae60'; // Excellent
    if (score >= 65) return '#2ecc71'; // Good
    if (score >= 50) return '#f39c12'; // Fair
    if (score >= 35) return '#e67e22'; // Poor
    return '#e74c3c'; // Critical
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, colorClass }) => (
    <div className="glass-panel p-6 flex flex-col h-full hover:border-gray-500/50 transition-all">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg bg-surface border border-gray-700 ${colorClass}`}>
          <Icon size={24} />
        </div>
        <h3 className="text-gray-400 font-medium text-sm tracking-wider uppercase">{title}</h3>
      </div>
      <div className="mt-auto">
        <div className="text-3xl font-bold text-gray-100 mb-1 capitalize">{value}</div>
        <div className="text-sm text-gray-500 capitalize">{subtitle}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-gray-200 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-primary">
                <Microscope size={36} />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white">
                DentaScan <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">UV-AI</span>
              </h1>
            </div>
            <p className="text-gray-400 mt-2 text-lg">CLIP-based Architecture Image Diagnostics</p>
          </div>
          {results && (
            <button 
              onClick={() => {setResults(null); setImage(null); setPreview(null);}}
              className="px-6 py-2 bg-surface hover:bg-gray-800 border border-gray-700 rounded-lg shadow-sm transition-colors text-sm font-medium"
            >
              Start New Analysis
            </button>
          )}
        </header>

        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger p-4 rounded-xl flex items-center gap-3 animate-pulse">
            <AlertCircle size={20} />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {!results ? (
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Upload Zone */}
            <div 
              className={`glass-panel border-2 border-dashed flex flex-col items-center justify-center p-12 text-center transition-all min-h-[400px]
                ${image ? 'border-primary/50 bg-primary/5' : 'border-gray-700/50 hover:border-gray-500 cursor-pointer'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => !image && fileInputRef.current.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
              />
              
              {image ? (
                <div className="w-full h-full flex flex-col items-center">
                  <img src={preview} alt="Preview" className="max-h-[300px] rounded-lg shadow-2xl mb-6 object-contain" />
                  <button 
                    onClick={(e) => { e.stopPropagation(); analyzeImage(); }}
                    disabled={loading}
                    className="w-full py-4 px-6 bg-primary hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                  >
                    {loading ? (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        AI Analysis Running...
                      </div>
                    ) : (
                      <>
                        <DatabaseZap size={20} />
                        Run Diagnostic Pipeline
                      </>
                    )}
                  </button>
                  {/* Medical Progress Bar */}
                  {loading && (
                    <div className="w-full mt-6 h-1.5 bg-surface rounded-full overflow-hidden">
                      <div className="h-full bg-primary animate-[pulse_1s_ease-in-out_infinite] w-full origin-left" style={{ animation: 'progress 2s ease-in-out infinite' }} />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mb-6 shadow-inner border border-gray-800">
                    <Upload size={32} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-200 mb-2">Drag and drop UV Image</h3>
                  <p className="text-gray-500 mb-6 max-w-sm">Upload high-resolution clinical UV fluorescence imagery for comprehensive AI assessment.</p>
                  <span className="px-5 py-2 bg-surface border border-gray-700 rounded-lg text-sm text-gray-400 font-medium hover:text-gray-200 transition-colors">
                    Browse Files
                  </span>
                </>
              )}
            </div>

            {/* Information Panel */}
            <div className="glass-panel p-8 flex flex-col justify-center">
              <h3 className="text-2xl font-semibold mb-6 flex items-center gap-3">
                <Activity size={24} className="text-primary" />
                Pipeline Overview
              </h3>
              <ul className="space-y-6 text-gray-400 max-w-lg">
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface border border-gray-700 flex items-center justify-center font-mono text-sm shrink-0">1</div>
                  <div>
                    <strong className="text-gray-200 block mb-1">Optical Isolation</strong>
                    Extract teeth ROI automatically utilizing LAB/HSV morphology.
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface border border-gray-700 flex items-center justify-center font-mono text-sm shrink-0">2</div>
                  <div>
                    <strong className="text-gray-200 block mb-1">CLIP Zero-Shot</strong>
                    Zero-shot visual classification for clinical disease indicators.
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface border border-gray-700 flex items-center justify-center font-mono text-sm shrink-0">3</div>
                  <div>
                    <strong className="text-gray-200 block mb-1">CLIPSeg Refinement</strong>
                    Transformer-driven segmentation heatmaps isolating pathology.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {/* Summary Panel */}
            <div className="glass-panel p-6 border-l-4 border-l-primary flex items-start gap-4">
                <Info className="text-primary mt-1 shrink-0" size={24} />
                <p className="text-gray-300 leading-relaxed text-lg italic">
                  &ldquo;{results.analysis.summary}&rdquo;
                </p>
            </div>

            {/* Results Header / Gauge */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="glass-panel p-6 sm:p-8 md:col-span-1 flex flex-col items-center justify-between relative">
                <h3 className="text-gray-400 font-medium mb-4 z-10 text-center">Composite Score</h3>
                <div className="relative w-full aspect-[2/1] sm:h-48 sm:aspect-auto flex flex-col items-center justify-end">
                  <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { value: results.analysis.health_score },
                            { value: 100 - results.analysis.health_score }
                          ]}
                          cx="50%"
                          cy="100%"
                          startAngle={180}
                          endAngle={0}
                          innerRadius="75%"
                          outerRadius="100%"
                          dataKey="value"
                          stroke="none"
                        >
                          <Cell fill={getGaugeColor(results.analysis.health_score)} />
                          <Cell fill="#1f2937" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="relative z-20 flex flex-col items-center justify-end pb-1 lg:pb-2">
                    <span className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight leading-none drop-shadow-sm" style={{ color: getGaugeColor(results.analysis.health_score) }}>
                      {results.analysis.health_score}
                    </span>
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-0.5">out of 100</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6 sm:p-8 md:col-span-2 flex flex-col justify-center relative overflow-hidden">
                <div className={`absolute right-0 top-0 w-64 h-64 -translate-y-1/4 translate-x-1/4 rounded-full blur-3xl opacity-10 pointer-events-none`} style={{ backgroundColor: getGaugeColor(results.analysis.health_score) }} />
                
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">AI Diagnostic Verdict</h3>
                <div className="flex flex-col sm:flex-row sm:items-end gap-x-6 gap-y-4">
                  <span className="text-5xl font-black tracking-tight" style={{ color: getGaugeColor(results.analysis.health_score) }}>
                    {(results.analysis.health_score >= 80) ? 'Excellent (A)' : 
                     (results.analysis.health_score >= 65) ? 'Good (B)' : 
                     (results.analysis.health_score >= 50) ? 'Fair (C)' : 
                     (results.analysis.health_score >= 35) ? 'Poor (D)' : 'Critical (F)'}
                  </span>
                  <div className="pb-1.5 flex items-center gap-2 text-xl font-medium text-gray-300 bg-surface/50 px-4 py-2 rounded-lg border border-gray-700/50">
                    <ShieldCheck size={24} className="text-primary" />
                    Classification: <span className="text-white capitalize">{results.analysis.overall_condition.replace('_', ' ')}</span>
                  </div>
                </div>
                
                <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">Confidence</span>
                    <strong className="text-gray-200">{(results.analysis.confidence * 100).toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">Caries Detected</span>
                    <strong className="text-gray-200">{results.analysis.findings.caries_detected ? 'Yes ⚠️' : 'No ✅'}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">Calculus Detected</span>
                    <strong className="text-gray-200">{results.analysis.findings.calculus_detected ? 'Yes ⚠️' : 'No ✅'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <MetricCard 
                title="UV Intensity" 
                value={results.analysis.uv_parameters.fluorescence_intensity} 
                subtitle="Calculated Optics" 
                icon={Activity} 
                colorClass="text-blue-400" 
              />
              <MetricCard 
                title="Plaque Severity" 
                value={results.analysis.findings.plaque_severity} 
                subtitle={results.analysis.findings.plaque_location} 
                icon={AlertTriangle} 
                colorClass="text-warning" 
              />
              <MetricCard 
                title="UV Uniformity" 
                value={results.analysis.uv_parameters.blue_white_uniformity} 
                subtitle="Surface Normalization" 
                icon={Shield} 
                colorClass="text-primary" 
              />
              <MetricCard 
                title="Dark Lesions" 
                value={results.analysis.uv_parameters.dark_lesion_count} 
                subtitle="Carious Entities" 
                icon={AlertCircle} 
                colorClass="text-danger" 
              />
            </div>

            {/* Visualizer & Recommendations */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-panel p-6 flex flex-col h-full bg-[#161b22]">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                  Clinical Recommendations
                </h3>
                <div className="flex flex-col gap-4">
                  {results.analysis.recommendations.map((rec, i) => (
                    <div key={i} className="flex gap-4 p-4 rounded-xl bg-[#0d1117] border border-gray-700/50">
                        <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={20} />
                        <span className="text-gray-300">{rec}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel p-6">
                <div className="grid sm:grid-cols-2 gap-6 h-full">
                  <div className="flex flex-col">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                      Isolated ROI
                    </h3>
                    <div className="bg-surface p-2 rounded-t-lg border border-b-0 border-gray-700/50 text-center text-[10px] font-semibold text-primary uppercase tracking-widest bg-primary/5">
                      Masked Selection
                    </div>
                    <img src={results.processed_images[1]} alt="Masked Model Input" className="w-full h-auto rounded-b-lg border border-gray-700/50 object-cover bg-black/50 aspect-square" />
                  </div>

                  <div className="flex flex-col h-full">
                    <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                      Condition Breakdown
                    </h3>
                    <div className="flex flex-col gap-4 justify-center h-full pb-2">
                      {(() => {
                        const sev = (val) => {
                          if (typeof val === 'boolean') return !val ? 100 : 20;
                          const v = String(val).toLowerCase();
                          if (v.includes("none") || v.includes("absent")) return 100;
                          if (v.includes("high") || v.includes("healthy")) return 90;
                          if (v.includes("minimal")) return 78;
                          if (v.includes("medium")) return 65;
                          if (v.includes("mild_issues")) return 55;
                          if (v.includes("mild")) return 60;
                          if (v.includes("moderate_issues") || v.includes("moderate")) return 38;
                          if (v.includes("low")) return 30;
                          if (v.includes("present")) return 22;
                          if (v.includes("severe")) return 10;
                          if (v.includes("extensive")) return 5;
                          if (v.includes("1-3")) return 60;
                          if (v.includes("4-7")) return 30;
                          if (v.includes("8+")) return 10;
                          return 50;
                        };

                        const plaqueScore = sev(results.analysis.findings.plaque_severity);
                        const cariesScore = results.analysis.findings.caries_detected ? 20 : 100;
                        const calcScore = results.analysis.findings.calculus_detected ? 30 : 100;
                        const uvScore = sev(results.analysis.findings.fluorescence_uniformity);
                        const healthScore = results.analysis.health_score;

                        const getColor = (s) => s >= 70 ? 'bg-[#2ecc71]' : s >= 40 ? 'bg-[#f39c12]' : 'bg-[#e74c3c]';

                        const renderBar = (label, score) => (
                          <div key={label} className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                              <span>{label}</span>
                              <span className="text-gray-300">{score}/100</span>
                            </div>
                            <div className="h-2 w-full bg-[#1c2128] rounded-full overflow-hidden border border-gray-700/50">
                              <div className={`h-full ${getColor(score)} transition-all duration-1000 shadow-[0_0_10px_currentColor]`} style={{ width: `${score}%`, opacity: 0.85 }}></div>
                            </div>
                          </div>
                        );

                        return (
                          <>
                            {renderBar("Plaque Absence", plaqueScore)}
                            {renderBar("Caries Absence", cariesScore)}
                            {renderBar("Calculus Absence", calcScore)}
                            {renderBar("UV Uniformity", uvScore)}
                            <div className="my-1 border-t border-gray-700/50"></div>
                            {renderBar("Overall Composite", healthScore)}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0); }
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}
