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
    pass