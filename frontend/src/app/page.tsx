'use client';
import { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Cell, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ComposedChart, ReferenceLine
} from 'recharts';
import './styles.css';

export default function Home() {
  const [countries, setCountries] = useState([]);
  const [allData, setAllData] = useState([]);
  const [predictions, setPredictions] = useState({});
  const [policyData, setPolicyData] = useState(null);
  const [economicData, setEconomicData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Interactive state
  const [selectedCountries, setSelectedCountries] = useState(['USA', 'CAN', 'MEX']);
  const [showPredictions, setShowPredictions] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [countriesRes, dataRes, policyRes, econRes] = await Promise.all([
        fetch('http://localhost:5000/api/countries'),
        fetch('http://localhost:5000/api/historical-data'),
        fetch('http://localhost:5000/api/policy-impact'),
        fetch('http://localhost:5000/api/economic-impact')
      ]);

      if (!countriesRes.ok || !dataRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const countriesData = await countriesRes.json();
      const allHistData = await dataRes.json();
      const policyInfo = await policyRes.json();
      const econInfo = await econRes.json();

      // Fetch predictions for all countries
      const predictionPromises = countriesData.map(country => 
        fetch(`http://localhost:5000/api/predict/${country.Country}`)
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      );
      
      const predictionsData = await Promise.all(predictionPromises);
      const predictionsMap = {};
      countriesData.forEach((country, idx) => {
        if (predictionsData[idx]) {
          predictionsMap[country.Country] = predictionsData[idx];
        }
      });

      setCountries(countriesData);
      setAllData(allHistData);
      setPredictions(predictionsMap);
      setPolicyData(policyInfo);
      setEconomicData(econInfo);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading data...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!allData.length) return <div className="error">No data available</div>;

  const latestYear = Math.max(...allData.map(d => d.Year));
  const earliestYear = Math.min(...allData.map(d => d.Year));
  
  const predictionYears = Object.values(predictions)
    .flatMap(p => p.predictions ? p.predictions.map(pr => pr.year) : []);
  const maxPredictionYear = predictionYears.length > 0 ? Math.max(...predictionYears) : latestYear;
  
  // Latest gaps
  const latestGaps = allData
    .filter(d => d.Year === latestYear)
    .sort((a, b) => b.WageGap - a.WageGap)
    .map(d => ({
      country: d.CountryName || d.Country,
      countryCode: d.Country,
      gap: Number(d.WageGap.toFixed(2))
    }));

  const bestCountries = [...latestGaps].reverse().slice(0, 15);

  // Global trend WITH PREDICTIONS
  const globalTrend = {};
  allData.forEach(d => {
    if (!globalTrend[d.Year]) globalTrend[d.Year] = [];
    globalTrend[d.Year].push(d.WageGap);
  });

  const historicalTrendData = Object.keys(globalTrend)
    .sort((a, b) => Number(a) - Number(b))
    .map(year => ({
      year: Number(year),
      avgGap: Number((globalTrend[year].reduce((a, b) => a + b, 0) / globalTrend[year].length).toFixed(2)),
      minGap: Number(Math.min(...globalTrend[year]).toFixed(2)),
      maxGap: Number(Math.max(...globalTrend[year]).toFixed(2)),
      type: 'historical'
    }));

  const futurePredictions = {};
  Object.entries(predictions).forEach(([countryCode, predData]) => {
    if (predData.predictions) {
      predData.predictions.forEach(pred => {
        if (!futurePredictions[pred.year]) futurePredictions[pred.year] = [];
        futurePredictions[pred.year].push(pred.gap);
      });
    }
  });

  const predictionTrendData = Object.keys(futurePredictions)
    .sort((a, b) => Number(a) - Number(b))
    .map(year => ({
      year: Number(year),
      avgGap: Number((futurePredictions[year].reduce((a, b) => a + b, 0) / futurePredictions[year].length).toFixed(2)),
      minGap: Number(Math.min(...futurePredictions[year]).toFixed(2)),
      maxGap: Number(Math.max(...futurePredictions[year]).toFixed(2)),
      type: 'prediction'
    }));

  const globalTrendData = [...historicalTrendData, ...predictionTrendData];

  // Selected countries trends WITH PREDICTIONS
  const selectedCountryTrends = {};
  
  // Add historical data for selected countries
  allData.forEach(d => {
    if (selectedCountries.includes(d.Country)) {
      const name = d.CountryName || d.Country;
      if (!selectedCountryTrends[d.Year]) {
        selectedCountryTrends[d.Year] = { year: d.Year, type: 'historical' };
      }
      selectedCountryTrends[d.Year][name] = d.WageGap;
    }
  });

  // Add prediction data for selected countries
  selectedCountries.forEach(countryCode => {
    const predData = predictions[countryCode];
    const country = countries.find(c => c.Country === countryCode);
    if (predData && predData.predictions && country) {
      predData.predictions.forEach(pred => {
        const name = country.CountryName || countryCode;
        if (!selectedCountryTrends[pred.year]) {
          selectedCountryTrends[pred.year] = { year: pred.year, type: 'prediction' };
        }
        selectedCountryTrends[pred.year][name] = pred.gap;
      });
    }
  });

  const selectedCountryData = Object.values(selectedCountryTrends)
    .sort((a, b) => a.year - b.year);

  // Get selected country names for charts
  const selectedCountryNames = selectedCountries
    .map(code => {
      const c = countries.find(country => country.Country === code);
      return c ? (c.CountryName || code) : code;
    })
    .filter((name, index, self) => self.indexOf(name) === index); // Remove duplicates

  // Gap distribution - FIX THE PIE CHART
  const gapRanges = [
    { name: '0-5%', min: 0, max: 5, fill: '#10b981' },
    { name: '5-10%', min: 5, max: 10, fill: '#3b82f6' },
    { name: '10-15%', min: 10, max: 15, fill: '#f59e0b' },
    { name: '15-20%', min: 15, max: 20, fill: '#ef4444' },
    { name: '20%+', min: 20, max: 1000, fill: '#991b1b' }
  ];

  const gapDistribution = gapRanges.map(range => ({
    name: range.name,
    value: latestGaps.filter(d => d.gap > range.min && d.gap <= range.max).length,
    fill: range.fill
  })).filter(d => d.value > 0); // Only show ranges with data

  // Future predictions for selected countries
  const futurePredictedGaps = selectedCountries
    .map(code => {
      const predData = predictions[code];
      const country = countries.find(c => c.Country === code);
      const lastPred = predData?.predictions?.[predData.predictions.length - 1];
      const currentData = allData.find(d => d.Country === code && d.Year === latestYear);
      
      return {
        country: country?.CountryName || code,
        countryCode: code,
        current: currentData ? Number(currentData.WageGap.toFixed(2)) : null,
        predicted: lastPred ? Number(lastPred.gap.toFixed(2)) : null,
        change: (lastPred && currentData) ? Number((lastPred.gap - currentData.WageGap).toFixed(2)) : null
      };
    })
    .filter(d => d.current !== null && d.predicted !== null);

  // Regional data
  const regionalData = economicData?.regional_gaps 
    ? Object.entries(economicData.regional_gaps).map(([region, gap]) => ({
        region,
        gap: Number(gap)
      }))
    : [];

  // Top performers
  const topPerformers = policyData?.top_performers || [];

  const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];

  const toggleCountry = (countryCode) => {
    setSelectedCountries(prev => 
      prev.includes(countryCode) 
        ? prev.filter(c => c !== countryCode)
        : [...prev, countryCode]
    );
  };

  return (
    <div className="dashboard">
      <header className="header">
        <h1>PAY GAP PROPHET</h1>
        <p className="subtitle">Analyzing Historical Gender Wage Gaps & Predicting Future Trends Using Machine Learning</p>
        <p className="data-info">{allData.length} data points | {countries.length} countries | {earliestYear}-{latestYear} → Predictions to {maxPredictionYear}</p>
      </header>

      <div className="explainer-box">
        <h3>📊 What is the Gender Wage Gap?</h3>
        <p>The <strong>gender wage gap</strong> is the difference between what men and women are paid for the same work. It's expressed as a percentage - for example, a <strong>15% gap</strong> means women earn 15% less than men on average. Our dashboard shows historical data and uses machine learning to predict how this gap will change in the future based on past trends.</p>
      </div>

      {/* Interactive Country Selector */}
      <div className="control-panel">
        <div className="country-selector-section">
          <h3>🌎 Select Countries to Compare</h3>
          <p className="helper-text">Click countries to add/remove them from charts (USA, Canada, Mexico selected by default)</p>
          <div className="country-chips">
            {countries.slice(0, 30).map(country => (
              <button
                key={country.Country}
                className={`country-chip ${selectedCountries.includes(country.Country) ? 'active' : ''}`}
                onClick={() => toggleCountry(country.Country)}
              >
                {country.CountryName || country.Country}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Current Global Avg</h3>
          <div className="stat-value">{economicData?.global_stats?.average_gap || 'N/A'}%</div>
          <div className="stat-subtitle">As of {latestYear}</div>
        </div>
        <div className="stat-card prediction">
          <h3>Predicted {maxPredictionYear}</h3>
          <div className="stat-value">
            {predictionTrendData.length > 0 ? predictionTrendData[predictionTrendData.length - 1]?.avgGap.toFixed(1) : 'N/A'}%
          </div>
          <div className="stat-subtitle">ML Forecast</div>
        </div>
        <div className="stat-card">
          <h3>Best Today</h3>
          <div className="stat-value">{bestCountries[0]?.country}</div>
          <div className="stat-subtitle">{bestCountries[0]?.gap}% gap</div>
        </div>
        <div className="stat-card">
          <h3>Countries Selected</h3>
          <div className="stat-value">{selectedCountries.length}</div>
          <div className="stat-subtitle">Currently viewing</div>
        </div>
      </div>

      <div className="charts-grid">
        {/* Chart 1: Selected Countries Trends */}
        <div className="chart-box large">
          <h3>1. SELECTED COUNTRIES: HISTORICAL DATA + ML PREDICTIONS</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={selectedCountryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis label={{ value: 'Wage Gap (%)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine x={latestYear} stroke="#10b981" strokeWidth={2} label="TODAY" />
              {selectedCountryNames.map((name, idx) => (
                <Line 
                  key={`selected-${name}-${idx}`}
                  type="monotone" 
                  dataKey={name} 
                  stroke={COLORS[idx % COLORS.length]} 
                  strokeWidth={3}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="chart-note">
            📈 Past data (before green line) shows actual historical wage gaps. Future predictions (after green line) are based on linear regression ML models trained on historical trends.
          </div>
        </div>

        {/* Chart 2: Global Trend */}
        <div className="chart-box large">
          <h3>2. GLOBAL AVERAGE: PAST + PREDICTED FUTURE</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={globalTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis label={{ value: 'Gap (%)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <ReferenceLine x={latestYear} stroke="#10b981" strokeWidth={2} label="TODAY" />
              <Line 
                type="monotone" 
                dataKey="avgGap" 
                stroke="#8b5cf6" 
                strokeWidth={3} 
                name="Average Gap"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="minGap" 
                stroke="#10b981" 
                strokeWidth={2}
                name="Best Country" 
                dot={false}
                strokeDasharray="3 3"
              />
              <Line 
                type="monotone" 
                dataKey="maxGap" 
                stroke="#ef4444" 
                strokeWidth={2}
                name="Worst Country" 
                dot={false}
                strokeDasharray="3 3"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="chart-note">
            🌍 Shows the global average wage gap across all countries. The green vertical line marks today - everything before is history, everything after is our ML prediction.
          </div>
        </div>

        {/* Chart 3: Selected Countries - Current vs Future */}
        <div className="chart-box">
          <h3>3. SELECTED COUNTRIES: {latestYear} VS {maxPredictionYear}</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={futurePredictedGaps} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="country" type="category" width={120} fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="current" fill="#8b5cf6" name={`Current ${latestYear}`} />
              <Bar dataKey="predicted" fill="#10b981" name={`Predicted ${maxPredictionYear}`} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-note">
            📊 Direct comparison showing how selected countries' wage gaps are predicted to change
          </div>
        </div>

        {/* Chart 4: Gap Distribution */}
        <div className="chart-box">
          <h3>4. CURRENT DISTRIBUTION BY GAP RANGE ({latestYear})</h3>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={gapDistribution}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={120}
                dataKey="value"
              >
                {gapDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-note">
            🎯 Shows how many countries fall into each wage gap range. Green = better equality, Red = worse inequality
          </div>
        </div>

        {/* Chart 5: Best Countries */}
        <div className="chart-box">
          <h3>5. TOP 15 BEST COUNTRIES (LOWEST WAGE GAP)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={bestCountries} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 'auto']} />
              <YAxis dataKey="country" type="category" width={120} fontSize={11} />
              <Tooltip />
              <Bar dataKey="gap" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-note">
            🏆 Countries with the smallest gender wage gap - closer to zero means more equal pay
          </div>
        </div>

        {/* Chart 6: Regional Comparison */}
        <div className="chart-box">
          <h3>6. REGIONAL WAGE GAP COMPARISON</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={regionalData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="region" angle={-20} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="gap" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-note">
            🌎 Average wage gaps by world region - shows which parts of the world are doing better or worse
          </div>
        </div>

        {/* Chart 7: Area Chart */}
        <div className="chart-box large">
          <h3>7. GLOBAL RANGE: BEST TO WORST (HISTORY + PREDICTIONS)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={globalTrendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip />
              <Legend />
              <ReferenceLine x={latestYear} stroke="#10b981" strokeWidth={2} label="TODAY" />
              <Area type="monotone" dataKey="maxGap" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Worst Country" />
              <Area type="monotone" dataKey="avgGap" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.5} name="Average" />
              <Area type="monotone" dataKey="minGap" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Best Country" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="chart-note">
            📉 The shaded area shows the range from best to worst country each year. Predictions show this range narrowing over time.
          </div>
        </div>

        {/* Chart 8: Top Policy Performers */}
        <div className="chart-box">
          <h3>8. POLICY LEADERS (FASTEST IMPROVEMENT RATE)</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={topPerformers.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} fontSize={10} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="annual_reduction" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-note">
            ⚡ Countries reducing their wage gap the fastest each year - these are policy success stories
          </div>
        </div>

        {/* Chart 9: Selected Countries Change */}
        <div className="chart-box">
          <h3>9. SELECTED COUNTRIES: PREDICTED CHANGE</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={futurePredictedGaps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="country" angle={-45} textAnchor="end" height={100} fontSize={11} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="change" fill="#10b981" name={`Change (${latestYear} to ${maxPredictionYear})`} />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-note">
            📊 How much each selected country's wage gap is predicted to change (negative = improvement)
          </div>
        </div>
      </div>

      {/* Data Tables */}
      <div className="tables-section">
        <h2>📋 DATA TABLES</h2>
        
        <div className="table-container">
          <h3>Selected Countries: Current vs Predicted</h3>
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Current Gap ({latestYear})</th>
                <th>Predicted Gap ({maxPredictionYear})</th>
                <th>Expected Change</th>
              </tr>
            </thead>
            <tbody>
              {futurePredictedGaps.map((d, idx) => (
                <tr key={idx}>
                  <td>{d.country}</td>
                  <td>{d.current}%</td>
                  <td className="prediction">{d.predicted}%</td>
                  <td className={d.change < 0 ? 'positive' : 'negative'}>
                    {d.change > 0 ? '+' : ''}{d.change}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-container">
          <h3>Top 15 Best Countries ({latestYear})</h3>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Country</th>
                <th>Wage Gap (%)</th>
              </tr>
            </thead>
            <tbody>
              {bestCountries.map((d, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{d.country}</td>
                  <td>{d.gap}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-container">
          <h3>Policy Leaders (Fastest Annual Improvement)</h3>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Country</th>
                <th>Annual Reduction (%/year)</th>
                <th>Current Gap (%)</th>
              </tr>
            </thead>
            <tbody>
              {topPerformers.slice(0, 10).map((d, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>{d.name}</td>
                  <td className="positive">{d.annual_reduction}%</td>
                  <td>{d.current_gap}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}