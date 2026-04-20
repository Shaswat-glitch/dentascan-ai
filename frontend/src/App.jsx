import React, { useState, useRef } from 'react';
import { Upload, AlertCircle, Activity, Shield, AlertTriangle, ShieldCheck, Microscope, DatabaseZap } from 'lucide-react';
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
        <div className="text-3xl font-bold text-gray-100 mb-1">{value}</div>
        <div className="text-sm text-gray-500">{subtitle}</div>
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
            <p className="text-gray-400 mt-2 text-lg">Advanced UV Fluorescence Dental Diagnostics via Google Colab Pipeline</p>
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
                    <strong className="text-gray-200 block mb-1">OpenAI CLIP ViT-L/14</strong>
                    Zero-shot visual classification for clinical disease indicators.
                  </div>
                </li>
                <li className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-surface border border-gray-700 flex items-center justify-center font-mono text-sm shrink-0">3</div>
                  <div>
                    <strong className="text-gray-200 block mb-1">Defect Mapping</strong>
                    Adaptive spatial thresholding identifying caries and fractures.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
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
                            { value: results.overall_score },
                            { value: 100 - results.overall_score }
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
                          <Cell fill={getGaugeColor(results.overall_score)} />
                          <Cell fill="#1f2937" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="relative z-20 flex flex-col items-center justify-end pb-1 lg:pb-2">
                    <span className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight leading-none drop-shadow-sm" style={{ color: getGaugeColor(results.overall_score) }}>
                      {results.overall_score.toFixed(1)}
                    </span>
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-0.5">out of 100</span>
                  </div>
                </div>
              </div>

              <div className="glass-panel p-6 sm:p-8 md:col-span-2 flex flex-col justify-center relative overflow-hidden">
                <div className={`absolute right-0 top-0 w-64 h-64 -translate-y-1/4 translate-x-1/4 rounded-full blur-3xl opacity-10 pointer-events-none`} style={{ backgroundColor: getGaugeColor(results.overall_score) }} />
                
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">AI Diagnostic Verdict</h3>
                <div className="flex flex-col sm:flex-row sm:items-end gap-x-6 gap-y-4">
                  <span className="text-6xl font-black tracking-tight" style={{ color: getGaugeColor(results.overall_score) }}>
                    {results.grade}
                  </span>
                  <div className="pb-1.5 flex items-center gap-2 text-xl font-medium text-gray-300 bg-surface/50 px-4 py-2 rounded-lg border border-gray-700/50">
                    <ShieldCheck size={24} className="text-primary" />
                    Classification: <span className="text-white">{results.top_prediction}</span>
                  </div>
                </div>
                
                <div className="mt-8 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">UV Fluor</span>
                    <strong className="text-gray-200">{results.metrics.scores["UV Fluorescence Quality"]?.toFixed(1)} / 40%</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">Surface Integrity</span>
                    <strong className="text-gray-200">{results.metrics.scores["Defect-Free Surface"]?.toFixed(1)} / 35%</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs uppercase mb-1">AI Visual</span>
                    <strong className="text-gray-200">{results.metrics.scores["AI Visual Assessment"]?.toFixed(1)} / 25%</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <MetricCard 
                title="Enamel Uniformity" 
                value={(results.metrics.uv.uniformity_score * 100).toFixed(1) + '%'} 
                subtitle="Calculated Optics" 
                icon={Activity} 
                colorClass="text-blue-400" 
              />
              <MetricCard 
                title="Plaque Patches" 
                value={results.metrics.defect.plaque_patch_count} 
                subtitle="Red Fluor Dominance" 
                icon={AlertTriangle} 
                colorClass="text-warning" 
              />
              <MetricCard 
                title="Whiteness Index" 
                value={(results.metrics.uv.whiteness_index * 100).toFixed(1) + '%'} 
                subtitle="Surface Normalization" 
                icon={Shield} 
                colorClass="text-primary" 
              />
              <MetricCard 
                title="Dark Lesions" 
                value={results.metrics.defect.dark_spot_count} 
                subtitle="Abs. Carious Entities" 
                icon={AlertCircle} 
                colorClass="text-danger" 
              />
            </div>

            {/* Visualizer & Detail Table */}
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-panel p-6 flex flex-col h-full bg-[#161b22]">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                  Extracted Parameters Table
                </h3>
                <div className="bg-[#0d1117] rounded-lg border border-gray-700/50 overflow-hidden flex-grow">
                  <table className="w-full text-sm text-left text-gray-400">
                    <tbody>
                      <tr className="border-b border-gray-700/50 bg-[#1c2128]">
                        <td className="px-4 py-3 font-medium text-gray-200">Fluorescence Intensity</td>
                        <td className="px-4 py-3 text-right">{results.metrics.uv.fluorescence_intensity.toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-gray-700/50">
                        <td className="px-4 py-3 font-medium text-gray-200">Blue Dominance</td>
                        <td className="px-4 py-3 text-right">{(results.metrics.uv.blue_dominance_ratio * 100).toFixed(2)}%</td>
                      </tr>
                      <tr className="border-b border-gray-700/50 bg-[#1c2128]">
                        <td className="px-4 py-3 font-medium text-gray-200">Red Fluor Ratio</td>
                        <td className="px-4 py-3 text-right">{(results.metrics.uv.red_fluor_ratio * 100).toFixed(2)}%</td>
                      </tr>
                      <tr className="border-b border-gray-700/50">
                        <td className="px-4 py-3 font-medium text-gray-200">Dark Spot Coverage</td>
                        <td className="px-4 py-3 text-right">{(results.metrics.defect.dark_area_coverage * 100).toFixed(3)}%</td>
                      </tr>
                      <tr className="border-b border-gray-700/50 bg-[#1c2128]">
                        <td className="px-4 py-3 font-medium text-gray-200">Red Coverage Ratio</td>
                        <td className="px-4 py-3 text-right">{(results.metrics.defect.red_coverage_ratio * 100).toFixed(3)}%</td>
                      </tr>
                      <tr className="border-b border-gray-700/50">
                        <td className="px-4 py-3 font-medium text-gray-200">Edge Density</td>
                        <td className="px-4 py-3 text-right">{(results.metrics.defect.edge_density * 100).toFixed(3)}%</td>
                      </tr>
                      <tr className="bg-[#1c2128]">
                        <td className="px-4 py-3 font-medium text-gray-200">Channel Balance</td>
                        <td className="px-4 py-3 text-right">{(results.metrics.uv.channel_balance * 100).toFixed(2)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    Spatial Defect Localizer
                  </h3>
                  <div className="flex flex-col gap-1 text-xs font-medium bg-surface/50 p-2 rounded-lg border border-gray-700/50">
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-400"></span> Edge Canny (Potential Decay)</div>
                    <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> Plaque Accumulation</div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 relative">
                  <div className="flex flex-col">
                    <div className="bg-surface p-2 rounded-t-lg border border-b-0 border-gray-700/50 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      Original UV Source
                    </div>
                    <img src={results.processed_images[0]} alt="Original Map" className="w-full h-auto rounded-b-lg border border-gray-700/50 object-cover bg-black/50 aspect-square" />
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-surface p-2 rounded-t-lg border border-b-0 border-gray-700/50 text-center text-[10px] font-semibold text-primary uppercase tracking-widest bg-primary/5">
                      AI Annotated Mapping
                    </div>
                    <img src={results.processed_images[2]} alt="Defect Map" className="w-full h-auto rounded-b-lg border border-primary/30 object-cover bg-black/50 aspect-square shadow-[0_0_30px_rgba(88,166,255,0.1)]" />
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
