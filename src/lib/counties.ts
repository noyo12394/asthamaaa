// ---------------------------------------------------------------------------
// PASS Equity Atlas — County dataset
//
// IMPORTANT: These are realistic, plausibly-scaled DEMO values assembled for
// prototyping the operations dashboard. They are NOT official measurements.
// Before any real deployment, replace these with live data from:
//   - EPA AQS (Air Quality System) monitor feeds
//   - CDC PLACES county health indicators
//   - U.S. Census / CDC SVI (Social Vulnerability Index)
//   - Satellite/reanalysis PM2.5 & NO2 surfaces (e.g. NASA, Van Donkelaar)
// Each numeric field below has a matching `unit` documented in CountyMetrics.
// ---------------------------------------------------------------------------

export interface CountyMetrics {
  /** PM2.5 annual average estimate, micrograms per cubic meter */
  pm25: number;
  /** NO2 / traffic-related pollution index, 0–100 (higher = more traffic burden) */
  no2Index: number;
  /** Ozone seasonal risk index, 0–100 (warm-season 8-hr context) */
  ozoneIndex: number;
  /** SO2 index, 0–100 (industrial point-source context) */
  so2Index: number;
  /** Distance to nearest EPA AQS monitor, miles */
  nearestMonitorMiles: number;
  /** Name of nearest EPA AQS monitor station */
  nearestMonitorName: string;
  /** Count of EPA AQS monitors within 25 miles */
  monitorsWithin25mi: number;
  /** Asthma prevalence, % of adults */
  asthma: number;
  /** Diagnosed diabetes prevalence, % of adults */
  diabetes: number;
  /** Coronary heart disease prevalence, % of adults */
  heartDisease: number;
  /** COPD prevalence, % of adults */
  copd: number;
  /** Obesity prevalence, % of adults */
  obesity: number;
  /** Population vulnerability index, 0–100 (CDC SVI-style; higher = more vulnerable) */
  vulnerabilityIndex: number;
}

export interface County {
  value: string;
  label: string;
  region: string;
  lat: number;
  lng: number;
  /** Major place names within the county, used for the search box */
  places: string[];
  metrics: CountyMetrics;
}

export const COUNTIES: County[] = [
  {
    value: "philadelphia",
    label: "Philadelphia County",
    region: "Southeast PA",
    lat: 39.9526,
    lng: -75.1652,
    places: ["Philadelphia", "Center City", "North Philadelphia", "West Philadelphia", "Germantown"],
    metrics: {
      pm25: 11.5, no2Index: 78, ozoneIndex: 55, so2Index: 34,
      nearestMonitorMiles: 1.8, nearestMonitorName: "Philadelphia - Rittenhouse", monitorsWithin25mi: 8,
      asthma: 13.5, diabetes: 13.8, heartDisease: 6.5, copd: 7.2, obesity: 32.0,
      vulnerabilityIndex: 82,
    },
  },
  {
    value: "allegheny",
    label: "Allegheny County",
    region: "Southwest PA",
    lat: 40.4406,
    lng: -79.9959,
    places: ["Pittsburgh", "McKeesport", "Bethel Park", "Monroeville", "Liberty"],
    metrics: {
      pm25: 12.8, no2Index: 62, ozoneIndex: 52, so2Index: 58,
      nearestMonitorMiles: 2.5, nearestMonitorName: "Pittsburgh - Lawrenceville", monitorsWithin25mi: 6,
      asthma: 12.1, diabetes: 11.5, heartDisease: 6.8, copd: 7.8, obesity: 31.0,
      vulnerabilityIndex: 68,
    },
  },
  {
    value: "delaware",
    label: "Delaware County",
    region: "Southeast PA",
    lat: 39.9168,
    lng: -75.3989,
    places: ["Chester", "Upper Darby", "Media", "Marcus Hook"],
    metrics: {
      pm25: 10.5, no2Index: 58, ozoneIndex: 55, so2Index: 46,
      nearestMonitorMiles: 3.2, nearestMonitorName: "Chester", monitorsWithin25mi: 6,
      asthma: 11.8, diabetes: 11.0, heartDisease: 5.8, copd: 6.4, obesity: 30.0,
      vulnerabilityIndex: 62,
    },
  },
  {
    value: "lehigh",
    label: "Lehigh County",
    region: "Lehigh Valley",
    lat: 40.6023,
    lng: -75.4714,
    places: ["Allentown", "Emmaus", "Catasauqua", "Whitehall"],
    metrics: {
      pm25: 9.8, no2Index: 45, ozoneIndex: 58, so2Index: 22,
      nearestMonitorMiles: 5.2, nearestMonitorName: "Allentown - Lehigh Valley", monitorsWithin25mi: 4,
      asthma: 11.2, diabetes: 10.8, heartDisease: 5.9, copd: 6.5, obesity: 30.5,
      vulnerabilityIndex: 58,
    },
  },
  {
    value: "northampton",
    label: "Northampton County",
    region: "Lehigh Valley",
    lat: 40.7540,
    lng: -75.3073,
    places: ["Bethlehem", "Easton", "Nazareth", "Bangor"],
    metrics: {
      pm25: 9.4, no2Index: 40, ozoneIndex: 57, so2Index: 20,
      nearestMonitorMiles: 8.1, nearestMonitorName: "Bethlehem", monitorsWithin25mi: 3,
      asthma: 10.8, diabetes: 10.2, heartDisease: 5.7, copd: 6.2, obesity: 29.8,
      vulnerabilityIndex: 54,
    },
  },
  {
    value: "montgomery",
    label: "Montgomery County",
    region: "Southeast PA",
    lat: 40.2110,
    lng: -75.3705,
    places: ["Norristown", "King of Prussia", "Lansdale", "Pottstown"],
    metrics: {
      pm25: 9.0, no2Index: 48, ozoneIndex: 56, so2Index: 18,
      nearestMonitorMiles: 4.0, nearestMonitorName: "Norristown", monitorsWithin25mi: 5,
      asthma: 9.5, diabetes: 8.5, heartDisease: 4.8, copd: 5.0, obesity: 26.0,
      vulnerabilityIndex: 38,
    },
  },
  {
    value: "bucks",
    label: "Bucks County",
    region: "Southeast PA",
    lat: 40.3101,
    lng: -75.1299,
    places: ["Doylestown", "Levittown", "Bristol", "Quakertown"],
    metrics: {
      pm25: 8.8, no2Index: 42, ozoneIndex: 57, so2Index: 17,
      nearestMonitorMiles: 6.5, nearestMonitorName: "Bristol", monitorsWithin25mi: 4,
      asthma: 9.2, diabetes: 8.8, heartDisease: 5.0, copd: 5.2, obesity: 27.0,
      vulnerabilityIndex: 40,
    },
  },
  {
    value: "berks",
    label: "Berks County",
    region: "South Central PA",
    lat: 40.4160,
    lng: -75.9267,
    places: ["Reading", "Wyomissing", "Kutztown", "Hamburg"],
    metrics: {
      pm25: 9.6, no2Index: 38, ozoneIndex: 56, so2Index: 21,
      nearestMonitorMiles: 12.0, nearestMonitorName: "Reading - Berks County", monitorsWithin25mi: 2,
      asthma: 10.5, diabetes: 10.5, heartDisease: 5.6, copd: 6.0, obesity: 31.0,
      vulnerabilityIndex: 56,
    },
  },
  {
    value: "lancaster",
    label: "Lancaster County",
    region: "South Central PA",
    lat: 40.0379,
    lng: -76.3055,
    places: ["Lancaster", "Ephrata", "Lititz", "Columbia"],
    metrics: {
      pm25: 10.2, no2Index: 32, ozoneIndex: 58, so2Index: 19,
      nearestMonitorMiles: 14.5, nearestMonitorName: "Lancaster", monitorsWithin25mi: 2,
      asthma: 9.8, diabetes: 9.5, heartDisease: 5.2, copd: 5.6, obesity: 29.0,
      vulnerabilityIndex: 48,
    },
  },
  {
    value: "dauphin",
    label: "Dauphin County",
    region: "Central PA",
    lat: 40.2732,
    lng: -76.8867,
    places: ["Harrisburg", "Hershey", "Hummelstown", "Steelton"],
    metrics: {
      pm25: 9.5, no2Index: 44, ozoneIndex: 55, so2Index: 24,
      nearestMonitorMiles: 7.0, nearestMonitorName: "Harrisburg - Dauphin", monitorsWithin25mi: 3,
      asthma: 11.0, diabetes: 11.2, heartDisease: 6.0, copd: 6.6, obesity: 32.0,
      vulnerabilityIndex: 60,
    },
  },
  {
    value: "erie",
    label: "Erie County",
    region: "Northwest PA",
    lat: 42.1292,
    lng: -80.0851,
    places: ["Erie", "Millcreek", "Corry", "Edinboro"],
    metrics: {
      pm25: 9.0, no2Index: 30, ozoneIndex: 50, so2Index: 23,
      nearestMonitorMiles: 9.0, nearestMonitorName: "Erie", monitorsWithin25mi: 2,
      asthma: 11.5, diabetes: 11.0, heartDisease: 6.2, copd: 7.0, obesity: 33.0,
      vulnerabilityIndex: 58,
    },
  },
  {
    value: "luzerne",
    label: "Luzerne County",
    region: "Northeast PA",
    lat: 41.1728,
    lng: -75.9975,
    places: ["Wilkes-Barre", "Hazleton", "Kingston", "Nanticoke"],
    metrics: {
      pm25: 9.2, no2Index: 28, ozoneIndex: 54, so2Index: 26,
      nearestMonitorMiles: 22.0, nearestMonitorName: "Scranton - Lackawanna", monitorsWithin25mi: 1,
      asthma: 12.0, diabetes: 11.8, heartDisease: 6.5, copd: 7.2, obesity: 33.5,
      vulnerabilityIndex: 64,
    },
  },
  {
    value: "monroe",
    label: "Monroe County",
    region: "Northeast PA (Poconos)",
    lat: 41.0568,
    lng: -75.3365,
    places: ["Stroudsburg", "East Stroudsburg", "Tobyhanna", "Mount Pocono"],
    metrics: {
      pm25: 7.8, no2Index: 18, ozoneIndex: 52, so2Index: 12,
      nearestMonitorMiles: 31.0, nearestMonitorName: "Scranton - Lackawanna", monitorsWithin25mi: 0,
      asthma: 10.0, diabetes: 9.0, heartDisease: 5.0, copd: 6.0, obesity: 28.0,
      vulnerabilityIndex: 50,
    },
  },
  {
    value: "centre",
    label: "Centre County",
    region: "Central PA",
    lat: 40.9192,
    lng: -77.8200,
    places: ["State College", "Bellefonte", "Philipsburg"],
    metrics: {
      pm25: 7.5, no2Index: 16, ozoneIndex: 50, so2Index: 10,
      nearestMonitorMiles: 12.0, nearestMonitorName: "State College - Centre", monitorsWithin25mi: 1,
      asthma: 8.5, diabetes: 8.0, heartDisease: 4.5, copd: 5.0, obesity: 26.0,
      vulnerabilityIndex: 36,
    },
  },
];

export interface MonitorLocation {
  name: string;
  lat: number;
  lng: number;
  type: "epa";
  pollutants: string[];
}

export const EPA_MONITORS: MonitorLocation[] = [
  { name: "Philadelphia - Northeast Airport", lat: 40.0818, lng: -75.0115, type: "epa", pollutants: ["PM2.5", "NO₂", "O₃"] },
  { name: "Philadelphia - Rittenhouse", lat: 39.9485, lng: -75.1710, type: "epa", pollutants: ["PM2.5", "SO₂"] },
  { name: "Philadelphia - Roxborough", lat: 40.0450, lng: -75.2310, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Chester", lat: 39.8496, lng: -75.3557, type: "epa", pollutants: ["PM2.5", "SO₂"] },
  { name: "Norristown", lat: 40.1215, lng: -75.3399, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Bristol", lat: 40.1009, lng: -74.8516, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Pittsburgh - Lawrenceville", lat: 40.4654, lng: -79.9608, type: "epa", pollutants: ["PM2.5", "NO₂", "SO₂", "O₃"] },
  { name: "Pittsburgh - South Fayette", lat: 40.3776, lng: -80.1620, type: "epa", pollutants: ["PM2.5", "SO₂"] },
  { name: "Pittsburgh - Liberty", lat: 40.3994, lng: -79.8451, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Allentown - Lehigh Valley", lat: 40.6084, lng: -75.4902, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Bethlehem", lat: 40.6259, lng: -75.3705, type: "epa", pollutants: ["PM2.5"] },
  { name: "Reading - Berks County", lat: 40.3357, lng: -75.9270, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Harrisburg - Dauphin", lat: 40.2632, lng: -76.8815, type: "epa", pollutants: ["PM2.5", "NO₂", "O₃"] },
  { name: "Lancaster", lat: 40.0429, lng: -76.3108, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "Scranton - Lackawanna", lat: 41.4090, lng: -75.6624, type: "epa", pollutants: ["PM2.5"] },
  { name: "Erie", lat: 42.1292, lng: -80.0851, type: "epa", pollutants: ["PM2.5", "O₃"] },
  { name: "State College - Centre", lat: 40.7934, lng: -77.8600, type: "epa", pollutants: ["O₃"] },
];

export function getCounty(value: string): County | undefined {
  return COUNTIES.find((c) => c.value === value);
}
