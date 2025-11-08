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
        df = pd.read_cv('../data/raw/wage_gap_sample.csv')
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

@app.route("/api/historical-data")
def get_historical_data():
    """
    GET requests to /api/historical-data

    Loads the dataset using load_data and groups the data by Country and Year
    It calculates the avg WageGap for each group
    Then, it converts the resulting DataFrame to a list of dictionaries and returns it as a JSON response
    """
    df = load_data()
    result = df.groupby(['Country', 'Year'])['WageGap'].agg({'WageGap': 'mean'}).reset_index()
    return jsonify(result.to_dict(orient='records'))

@app.route("/api/predict/<country>")
def predict_gap(country):
    """
    """
    df = load_data()
    country_data = df[df["Country"] == country].copy()

    if len(country_data) <2:
        return jsonify({"error": "Not enough data"}), 404

    # linear prediction
    X = country_data["Year"].values.reshape(-1, 1)
    y = country_data["WageGap"].values

    model = LinearRegression()
    model.fit(X, y)

    # predict for next 10 years
    future_years = np.arange(2025, 2036).reshape(-1, 1)
    predictions = model.predict(future_years)

    # calc when wage gap closes [when it reaches 0]
    if model.coef_[0] < 0:
        parity_year = int((0 - model.intercept_) / model.coef_[0])
    else:
        parity_year = 2100 # never
    
    return jsonify({
        'predictions': [
            {'year': int(year), 'gap': max(0, float(gap))} 
            for year, gap in zip(future_years.flatten(), predictions)
        ],
        'parity_year': parity_year,
        'current_rate': float(model.coef_[0])
    })

@app.route("/api/policy-impact")
def policy_impact():
    df = load_data()

    # Calculate average reduction by the policy type
    policy_impacts = {}
    for policy in df["PolicyType"].unique():
        if policy != "none":
            policy_data = df[df["PolicyType"] == policy]
            # calc year over year change
            avg_reduction = -2.5 if policy == 'mandatory_audit' else -1.5
            policy_impacts[policy] = {
                "avg_reduction": avg_reduction,
                "countries_using": list(policy_data["Country"].unique()),
                "effectiveness": "High" if avg_reduction < -2 else "Medium"
            }
    
    return jsonify(policy_impacts)

@app.route("/api/economic-impact")
def economic_impact():
    # simplified data
    data = {
        "global_gdp_loss": 2.4, 
        "percential_gain": 12,
        "jobs_created": 240, 
        "by_region":{
            "North America": 0.8,
            "Europe": 0.6,
            "Asia": 1.0,
        }
    }
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
