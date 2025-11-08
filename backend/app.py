from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# load data
def load_data():
    try:
        df = pd.read_cv('../data/raw/wage_gap_sample.csv')
        return df
    except:
        # if above fails use this data
        data = {
            "Country": ['USA'] * 5 + ["Iceland"] * 5  + ["Norway"] * 5,
            "Year": [2010, 2015, 2020, 2024, 2025] * 3,
            "WageGap": [18.5, 17.9, 16.0, 15.2, 14.8] + 
                      [14.0, 10.5, 4.8, 3.2, 2.5] + 
                      [15.5, 12.0, 8.5, 6.2, 5.0],
            'PolicyType': ['none', 'none', 'transparency', 'transparency', 'transparency'] +
                         ['none', 'quota', 'mandatory_audit', 'mandatory_audit', 'mandatory_audit'] +
                         ['none', 'quota', 'quota', 'transparency', 'transparency']
        }
        return pd.DataFrame(data)


@app.rouute("/api/historical-data")
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
        parity_year = int(-model.intercept_ / model.coef_[0])
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
    pass