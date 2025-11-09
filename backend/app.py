from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
import json
from datetime import datetime

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

wage_data = None 
# load data
def load_data():
    global wage_data
    try:
        df = pd.read_csv('../data/raw/oecd_wage_gap.csv')
        # extract columns from csv
        processed_df = pd.DataFrame({
            'Country': df['REF_AREA'],
            'Year': pd.to_numeric(df['TIME_PERIOD'], errors='coerce'),
            'WageGap': pd.to_numeric(df['OBS_VALUE'], errors='coerce')
        })
        # remove any NaN vals 
        processed_df = processed_df.dropna()

        country_mappings = {
            'USA': 'United States',
            'JPN': 'Japan',
            'DEU': 'Germany',
            'GBR': 'United Kingdom',
            'FRA': 'France',
            'ITA': 'Italy',
            'CAN': 'Canada',
            'AUS': 'Australia',
            'ESP': 'Spain',
            'KOR': 'South Korea',
            'MEX': 'Mexico',
            'NLD': 'Netherlands',
            'CHE': 'Switzerland',
            'SWE': 'Sweden',
            'BEL': 'Belgium',
            'AUT': 'Austria',
            'NOR': 'Norway',
            'ISL': 'Iceland',
            'DNK': 'Denmark',
            'FIN': 'Finland',
            'PRT': 'Portugal',
            'GRC': 'Greece',
            'CZE': 'Czech Republic',
            'HUN': 'Hungary',
            'POL': 'Poland',
            'SVK': 'Slovakia',
            'CHL': 'Chile',
            'EST': 'Estonia',
            'ISR': 'Israel',
            'SVN': 'Slovenia',
            'LVA': 'Latvia',
            'LTU': 'Lithuania',
            'LUX': 'Luxembourg',
            'IRL': 'Ireland',
            'NZL': 'New Zealand',
            'TUR': 'Turkey'
        }
        processed_df['CountryName'] = processed_df['Country'].map(country_mappings).fillna(processed_df['Country'])
        wage_data = processed_df
        return processed_df

    except Exception as e:
        print(f"Error loading data: {e}")
        return pd.DataFrame()
# load data at startup
load_data()

@app.route("/api/countries")
def get_countries():
    if wage_data is None or wage_data.empty:
        return jsonify([])
    countries = wage_data[["Country", "CountryName"]].drop_duplicates()
    return jsonify(countries.to_dict(orient='records'))

@app.route("/api/historical-data")
def get_historical_data():
    """
    GET requests to /api/historical-data

    Loads the dataset using load_data and groups the data by Country and Year
    It calculates the avg WageGap for each group
    Then, it converts the resulting DataFrame to a list of dictionaries and returns it as a JSON response
    """
    # df = load_data()
    # result = df.groupby(['Country', 'Year'])['WageGap'].agg({'WageGap': 'mean'}).reset_index()
    # return jsonify(result.to_dict(orient='records'))

    if wage_data is None or wage_data.empty:
        return jsonify([])
    # return all the data
    result = wage_data.to_dict(orient='records')
    return jsonify(result)

@app.route("/api/country-data/<country_code>")
def get_country_data(country_code):
    if wage_data is None or wage_data.empty:
        return jsonify({"error": "Data not available"}), 404
    
    # filter data for the country
    country_data = wage_data[wage_data["Country"] == country_code]
    if country_data.empty:
        return jsonify({"error": "Country not found"}), 404
    
    # latest wage gap value
    latest_year = country_data["Year"].max()
    latest_gap = country_data[country_data["Year"] == latest_year]["WageGap"].values[0] 

    # calc the rate of change
    if len(country_data) >= 2:
        X = country_data["Year"].values.reshape(-1, 1)
        y = country_data["WageGap"].values
        model = LinearRegression()
        model.fit(X, y)
        annual_change = float(model.coef_[0])
    else:
        annual_change = 0
    return jsonify({
        "country": country_code,
        "countryName": country_data["CountryName"].iloc[0],
        "currentGap": float(latest_gap),
        "latestYear": int(latest_year),
        "annualChange": annual_change,
        "historicalData": country_data.to_dict(orient='records')
    })

@app.route('/api/predict/<country_code>')
def predict_gap(country_code):
    """
    TODO: Implement this function
    """
    if wage_data is None or wage_data.empty:
        return jsonify({"error": "Data not available"}), 404
    
    country_data = wage_data[wage_data["Country"] == country_code].copy()
    if len(country_data) < 2:
        return jsonify({"error": "Not enough data"}), 404

    # linear prediction
    X = country_data["Year"].values.reshape(-1, 1)
    y = country_data["WageGap"].values

    model = LinearRegression()
    model.fit(X, y)

    # predict for next 15 years
    current_year = int(country_data['Year'].max())
    future_years = np.arange(current_year + 1, current_year + 16).reshape(-1, 1)
    predictions = model.predict(future_years)
        
    # Calculate when wage gap reaches zero (parity)
    if model.coef_[0] < 0:  # Gap is decreasing
        # y = mx + b, solve for x when y = 0
        parity_year = int((0 - model.intercept_) / model.coef_[0])
        # if parity year is unrealistic, we cap it
        if parity_year > 2100 or parity_year < current_year:
            parity_year = None
    else:
        parity_year = None  # Gap is increasing or stable
    
    return jsonify({
        "country": country_code,
        "countryName": country_data["CountryName"].iloc[0],
        "predictions": [
            {"year": int(year), "gap": max(0, float(gap))} 
            for year, gap in zip(future_years.flatten(), predictions)
        ],
        "parityYear": parity_year,
        "currentRate": float(model.coef_[0]),
        "currentGap": float(y[-1]),
    })

    # OLD CODE BELOW FOR REFERENCE
    # # predict for next 10 years
    # future_years = np.arange(2025, 2036).reshape(-1, 1)
    # predictions = model.predict(future_years)

    # # calc when wage gap closes [when it reaches 0]
    # if model.coef_[0] < 0:
    #     parity_year = int((0 - model.intercept_) / model.coef_[0])
    # else:
    #     parity_year = 2100 # never
    
    # return jsonify({
    #     'predictions': [
    #         {'year': int(year), 'gap': max(0, float(gap))} 
    #         for year, gap in zip(future_years.flatten(), predictions)
    #     ],
    #     'parity_year': parity_year,
    #     'current_rate': float(model.coef_[0])
    # })

@app.route("/api/policy-impact")
def policy_impact():
    if wage_data is None or wage_data.empty:
        return jsonify({})

    country_rates = {}
    # Calculate average reduction by the policy type
    # for policy in df["PolicyType"].unique():
    #     if policy != "none":
    #         policy_data = df[df["PolicyType"] == policy]
    #         # calc year over year change
    #         avg_reduction = -2.5 if policy == 'mandatory_audit' else -1.5
    #         policy_impacts[policy] = {
    #             "avg_reduction": avg_reduction,
    #             "countries_using": list(policy_data["Country"].unique()),
    #             "effectiveness": "High" if avg_reduction < -2 else "Medium"
    #         }
    
    # return jsonify(policy_impacts)

    for country in wage_data["Country"].unique():
        country_data = wage_data[wage_data["Country"] == country].sort_values("Year")

        if len(country_data) >= 5: # at least 5 years of data neeeeeded
            # rate of change calc
            X = country_data["Year"].values.reshape(-1, 1)
            y = country_data["WageGap"].values
            model = LinearRegression()
            model.fit(X, y)

            country_rates[country] = {
                "name": country_data["CountryName"].iloc[0],
                "rate": float(model.coef_[0]),
                "current_gap": float(country_data["WageGap"].iloc[-1]),
                "years_of_data": len(country_data),
            }
    
    # sort by rate of improvement
    sorted_countries = sorted(country_rates.items(), key=lambda x: x[1]["rate"])

    # top performance countries:
    top_performers = sorted_countries[:5] if len(sorted_countries) >=5 else sorted_countries

    # calcualte the avg rate
    all_rates = [data["rate"] for _, data in country_rates.items()]
    avg_rate = np.mean(all_rates) if all_rates else 0

    # the policy recommendation based on top performers
    policy_insights = {
        "top_performers": [{
            "country": code,
            "name": data["name"],
            "annual_reduction": round(abs(data["rate"]), 2),
            "current_gap": round(data["current_gap"], 1)

        }
        for code, data in top_performers
        ],
        "average_annual_rates": round(avg_rate, 2),
        "best_practices": {
            "fast_closers": [data['name'] for _, data in top_performers[:3]],
            "avg_reduction_leaders": round(abs(np.mean([data['rate'] for _, data in top_performers[:3]])), 2)
        }
    }
    return jsonify(policy_insights)

@app.route("/api/economic-impact")
def economic_impact():
    # # simplified data
    # data = {
    #     "global_gdp_loss": 2.4, 
    #     "percential_gain": 12,
    #     "jobs_created": 240, 
    #     "by_region":{
    #         "North America": 0.8,
    #         "Europe": 0.6,
    #         "Asia": 1.0,
    #     }
    # }
    # return jsonify(data) 
    if wage_data is None or wage_data.empty:
        return jsonify({})
    
    # calc the real stats from the data
    latest_year = wage_data["Year"].max()
    latest_data = wage_data[wage_data["Year"] == latest_year]

    # calc avg global wage gap
    avg_global_gap = latest_data["WageGap"].mean()

    # countries w data
    num_countries = wage_data["Country"].nunique()

    # calculate improvement over time
    earliest_year = wage_data["Year"].min()
    earliest_data = wage_data[wage_data['Year'] == earliest_year]

    # avg improvements
    countries_both_years = set(earliest_data["Country"].unique()) & set(latest_data["Country"].unique())

    total_improvement = 0
    count = 0

    for country in countries_both_years:
        early_gap = earliest_data[earliest_data['Country'] == country]['WageGap'].iloc[0]
        late_gap = latest_data[latest_data['Country'] == country]['WageGap'].iloc[0]
        improvement = early_gap - late_gap
        if improvement > 0:  # Only count improvements
            total_improvement += improvement
            count += 1
    
    avg_improvement = total_improvement / count if count > 0 else 0
    # calculate potential GDP impact (studies show ~15% GDP gain from closing gaps)
    gdp_impact = avg_global_gap * 0.15  # simplified calculation

    regions = {
        'North America': ['USA', 'CAN', 'MEX'],
        'Europe': ['DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'NLD', 'BEL', 'AUT', 'CHE', 'SWE', 'NOR', 'DNK', 'FIN', 'ISL'],
        'Asia Pacific': ['JPN', 'KOR', 'AUS', 'NZL'],
        'Latin America': ['CHL', 'MEX'],    
    }

    regional_gaps = {}
    for region, countries in regions.items():
        region_data = latest_data[latest_data['Country'].isin(countries)]
        if not region_data.empty:
            regional_gaps[region] = round(region_data['WageGap'].mean(), 1)
    
    return jsonify({
        'global_stats': {
            'average_gap': round(avg_global_gap, 1),
            'countries_analyzed': num_countries,
            'years_of_data': int(latest_year - earliest_year),
            'avg_improvement': round(avg_improvement, 1)
        },
        'economic_potential': {
            'gdp_impact_percent': round(gdp_impact, 1),
            'estimated_gain_trillion': round(gdp_impact * 0.1, 1)  # rough estimate
        },
        'regional_gaps': regional_gaps,
        'data_period': {
            'start': int(earliest_year),
            'end': int(latest_year)
        }
    })

@app.route("/api/test")
def test():
    return jsonify({"status": "API is running", "data_loaded": wage_data is not None and not wage_data.empty})

if __name__ == "__main__":
    app.run(debug=True, port=5000, host='0.0.0.0')
