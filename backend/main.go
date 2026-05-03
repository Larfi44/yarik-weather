package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ---------- Structs matching the Rust types ----------

type CurrentData struct {
	Temperature float64 `json:"temperature"`
	WindSpeed   float64 `json:"wind_speed"`
	Condition   string  `json:"condition"`
}

type HourlyData struct {
	Date        string  `json:"date"`
	Time        string  `json:"time"`
	Temperature float64 `json:"temperature"`
	WindSpeed   float64 `json:"wind_speed"`
	Condition   string  `json:"condition"`
}

type DailyData struct {
	Date             string   `json:"date"`
	TemperatureMax   float64  `json:"temperature_max"`
	TemperatureMin   float64  `json:"temperature_min"`
	WindSpeedMax     float64  `json:"wind_speed_max"`
	Condition        string   `json:"condition"`
	Sunrise          *string  `json:"sunrise"`
	Sunset           *string  `json:"sunset"`
	MoonPhaseName    *string  `json:"moon_phase_name"`
	MoonIllumination *float64 `json:"moon_illumination"`
}

type WeatherResponse struct {
	City      string       `json:"city"`
	Current   CurrentData  `json:"current"`
	Hourly    []HourlyData `json:"hourly"`
	Yesterday DailyData    `json:"yesterday"`
	Forecast  []DailyData  `json:"forecast"`
}

// ---------- Open‑Meteo API response structures ----------

type GeocodingResponse struct {
	Results []struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
	} `json:"results"`
}

type OpenMeteoForecast struct {
	Current struct {
		Temperature2m float64 `json:"temperature_2m"`
		WindSpeed10m  float64 `json:"wind_speed_10m"`
		WeatherCode   int     `json:"weather_code"`
	} `json:"current"`
	Hourly struct {
		Time          []string  `json:"time"`
		Temperature2m []float64 `json:"temperature_2m"`
		WindSpeed10m  []float64 `json:"wind_speed_10m"`
		WeatherCode   []int     `json:"weather_code"`
	} `json:"hourly"`
	Daily struct {
		Time             []string  `json:"time"`
		Temperature2mMax []float64 `json:"temperature_2m_max"`
		Temperature2mMin []float64 `json:"temperature_2m_min"`
		WindSpeed10mMax  []float64 `json:"wind_speed_10m_max"`
		WeatherCode      []int     `json:"weather_code"`
		Sunrise          []string  `json:"sunrise"`
		Sunset           []string  `json:"sunset"`
	} `json:"daily"`
}

type OpenMeteoArchive struct {
	Daily struct {
		Time             []string  `json:"time"`
		Temperature2mMax []float64 `json:"temperature_2m_max"`
		Temperature2mMin []float64 `json:"temperature_2m_min"`
		WindSpeed10mMax  []float64 `json:"wind_speed_10m_max"`
		WeatherCode      []int     `json:"weather_code"`
	} `json:"daily"`
}

// ---------- Weather description ----------

func weatherDescription(code int) string {
	switch code {
	case 0:
		return "Clear sky"
	case 1:
		return "Mainly clear"
	case 2:
		return "Partly cloudy"
	case 3:
		return "Overcast"
	case 45:
		return "Fog"
	case 48:
		return "Depositing rime fog"
	case 51:
		return "Light drizzle"
	case 53:
		return "Moderate drizzle"
	case 55:
		return "Dense drizzle"
	case 56:
		return "Light freezing drizzle"
	case 57:
		return "Dense freezing drizzle"
	case 61:
		return "Slight rain"
	case 63:
		return "Moderate rain"
	case 65:
		return "Heavy rain"
	case 66:
		return "Light freezing rain"
	case 67:
		return "Heavy freezing rain"
	case 71:
		return "Slight snow fall"
	case 73:
		return "Moderate snow fall"
	case 75:
		return "Heavy snow fall"
	case 77:
		return "Snow grains"
	case 80:
		return "Slight rain showers"
	case 81:
		return "Moderate rain showers"
	case 82:
		return "Violent rain showers"
	case 85:
		return "Slight snow showers"
	case 86:
		return "Heavy snow showers"
	case 95:
		return "Thunderstorm"
	case 96:
		return "Thunderstorm with slight hail"
	case 99:
		return "Thunderstorm with heavy hail"
	default:
		return "Unknown"
	}
}

// ---------- Moon phase (same formula as Rust) ----------

func moonPhaseForDate(date time.Time) (string, float64) {
	const synodicMonth = 29.53058867
	referenceNewMoon := time.Date(2000, 1, 6, 0, 0, 0, 0, time.UTC)
	daysSinceReference := date.Sub(referenceNewMoon).Hours() / 24
	age := math.Mod(daysSinceReference, synodicMonth)
	if age < 0 {
		age += synodicMonth
	}
	illumination := ((1.0 - math.Cos(2*math.Pi*age/synodicMonth)) / 2.0) * 100.0

	phaseName := "New Moon"
	switch {
	case age < 1.84566:
		phaseName = "New Moon"
	case age < 5.53699:
		phaseName = "Waxing Crescent"
	case age < 9.22831:
		phaseName = "First Quarter"
	case age < 12.91963:
		phaseName = "Waxing Gibbous"
	case age < 16.61096:
		phaseName = "Full Moon"
	case age < 20.30228:
		phaseName = "Waning Gibbous"
	case age < 23.99361:
		phaseName = "Last Quarter"
	case age < 27.68493:
		phaseName = "Waning Crescent"
	}

	if illumination > 100 {
		illumination = 100
	} else if illumination < 0 {
		illumination = 0
	}
	return phaseName, illumination
}

// ---------- Fetch helper ----------

func fetchJSON(url string, target interface{}) error {
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API error: %s", resp.Status)
	}

	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("parse error: %w", err)
	}
	return nil
}

// ---------- Geocoding ----------

func getCoordinates(city string) (float64, float64, error) {
	encoded := url.QueryEscape(city)

	// Detect Cyrillic
	hasCyrillic := false
	for _, r := range city {
		if r >= 0x0400 && r <= 0x04FF {
			hasCyrillic = true
			break
		}
	}
	lang := "en"
	if hasCyrillic {
		lang = "ru"
	}

	apiURL := fmt.Sprintf("https://geocoding-api.open-meteo.com/v1/search?name=%s&count=1&language=%s&format=json", encoded, lang)

	var result GeocodingResponse
	if err := fetchJSON(apiURL, &result); err != nil {
		return 0, 0, err
	}
	if len(result.Results) == 0 {
		return 0, 0, fmt.Errorf("city '%s' not found", city)
	}
	return result.Results[0].Latitude, result.Results[0].Longitude, nil
}

// ---------- Forecast & Yesterday ----------

func fetchForecast(lat, lon float64) (*OpenMeteoForecast, error) {
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f&current=temperature_2m,wind_speed_10m,weather_code&hourly=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code,sunrise,sunset&timezone=auto",
		lat, lon,
	)
	var forecast OpenMeteoForecast
	if err := fetchJSON(url, &forecast); err != nil {
		return nil, err
	}
	return &forecast, nil
}

func fetchYesterday(lat, lon float64) (DailyData, error) {
	yesterday := time.Now().AddDate(0, 0, -1)
	dateStr := yesterday.Format("2006-01-02")
	url := fmt.Sprintf(
		"https://archive-api.open-meteo.com/v1/archive?latitude=%.4f&longitude=%.4f&start_date=%s&end_date=%s&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,weather_code&timezone=auto",
		lat, lon, dateStr, dateStr,
	)

	var archive OpenMeteoArchive
	if err := fetchJSON(url, &archive); err != nil {
		return DailyData{}, err
	}
	if len(archive.Daily.Time) == 0 {
		return DailyData{}, fmt.Errorf("no historical data available")
	}

	moonName, moonIllum := moonPhaseForDate(yesterday)

	return DailyData{
		Date:             archive.Daily.Time[0],
		TemperatureMax:   archive.Daily.Temperature2mMax[0],
		TemperatureMin:   archive.Daily.Temperature2mMin[0],
		WindSpeedMax:     archive.Daily.WindSpeed10mMax[0],
		Condition:        weatherDescription(archive.Daily.WeatherCode[0]),
		Sunrise:          nil,
		Sunset:           nil,
		MoonPhaseName:    &moonName,
		MoonIllumination: &moonIllum,
	}, nil
}

// ---------- Main handler ----------

func getWeatherHandler(w http.ResponseWriter, r *http.Request) {
	// Extract city from URL path: /get_weather/{city}
	path := r.URL.Path
	prefix := "/get_weather/"
	if !strings.HasPrefix(path, prefix) {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	city, err := url.QueryUnescape(strings.TrimPrefix(path, prefix))
	if err != nil || city == "" {
		http.Error(w, "Invalid city", http.StatusBadRequest)
		return
	}

	// Geocode
	lat, lon, err := getCoordinates(city)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Concurrent fetch
	type forecastResult struct {
		forecast *OpenMeteoForecast
		err      error
	}
	type yesterdayResult struct {
		yesterday DailyData
		err       error
	}
	forecastChan := make(chan forecastResult, 1)
	yesterdayChan := make(chan yesterdayResult, 1)

	go func() {
		f, e := fetchForecast(lat, lon)
		forecastChan <- forecastResult{f, e}
	}()
	go func() {
		y, e := fetchYesterday(lat, lon)
		yesterdayChan <- yesterdayResult{y, e}
	}()

	fRes := <-forecastChan
	yRes := <-yesterdayChan

	if fRes.err != nil {
		http.Error(w, fRes.err.Error(), http.StatusInternalServerError)
		return
	}
	if yRes.err != nil {
		http.Error(w, yRes.err.Error(), http.StatusInternalServerError)
		return
	}

	forecast := fRes.forecast
	yesterday := yRes.yesterday

	// Current
	current := CurrentData{
		Temperature: forecast.Current.Temperature2m,
		WindSpeed:   forecast.Current.WindSpeed10m,
		Condition:   weatherDescription(forecast.Current.WeatherCode),
	}

	// Hourly: skip today, max 6 days
	var hourly []HourlyData
	if len(forecast.Hourly.Time) > 0 {
		todayDate := strings.Split(forecast.Hourly.Time[0], "T")[0]
		count := 0
		for i, isoTime := range forecast.Hourly.Time {
			dateOnly := strings.Split(isoTime, "T")[0]
			if dateOnly == todayDate {
				continue
			}
			timeOnly := strings.Split(isoTime, "T")[1]
			if len(timeOnly) >= 5 {
				timeOnly = timeOnly[:5]
			}
			hourly = append(hourly, HourlyData{
				Date:        dateOnly,
				Time:        timeOnly,
				Temperature: forecast.Hourly.Temperature2m[i],
				WindSpeed:   forecast.Hourly.WindSpeed10m[i],
				Condition:   weatherDescription(forecast.Hourly.WeatherCode[i]),
			})
			count++
			if count == 6*24 {
				break
			}
		}
	}

	// Daily forecast with moon
	var forecastDays []DailyData
	for i, date := range forecast.Daily.Time {
		parsedDate, _ := time.Parse("2006-01-02", date)
		moonName, moonIllum := moonPhaseForDate(parsedDate)
		sunrise := forecast.Daily.Sunrise[i]
		sunset := forecast.Daily.Sunset[i]
		forecastDays = append(forecastDays, DailyData{
			Date:             date,
			TemperatureMax:   forecast.Daily.Temperature2mMax[i],
			TemperatureMin:   forecast.Daily.Temperature2mMin[i],
			WindSpeedMax:     forecast.Daily.WindSpeed10mMax[i],
			Condition:        weatherDescription(forecast.Daily.WeatherCode[i]),
			Sunrise:          &sunrise,
			Sunset:           &sunset,
			MoonPhaseName:    &moonName,
			MoonIllumination: &moonIllum,
		})
	}

	response := WeatherResponse{
		City:      city,
		Current:   current,
		Hourly:    hourly,
		Yesterday: yesterday,
		Forecast:  forecastDays,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ---------- CORS middleware ----------

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "*")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- Main ----------

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/get_weather/", getWeatherHandler)

	handler := corsMiddleware(mux)

	port := 3000
	fmt.Printf("Server starting on port %d\n", port)
	if err := http.ListenAndServe(fmt.Sprintf("0.0.0.0:%d", port), handler); err != nil {
		fmt.Printf("Server failed: %v\n", err)
	}
}