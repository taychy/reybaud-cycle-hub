import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cloud, Sun, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Wind } from "lucide-react";

interface WeatherData {
  temp: number;
  windSpeed: number;
  code: number;
}

const weatherIcon = (code: number) => {
  if (code === 0 || code === 1) return <Sun className="w-3.5 h-3.5 text-primary" />;
  if (code <= 3) return <Cloud className="w-3.5 h-3.5 text-muted-foreground" />;
  if (code <= 48) return <Cloud className="w-3.5 h-3.5 text-muted-foreground" />;
  if (code <= 57) return <CloudDrizzle className="w-3.5 h-3.5 text-accent" />;
  if (code <= 67) return <CloudRain className="w-3.5 h-3.5 text-accent" />;
  if (code <= 77) return <CloudSnow className="w-3.5 h-3.5 text-accent" />;
  if (code <= 82) return <CloudRain className="w-3.5 h-3.5 text-accent" />;
  if (code <= 99) return <CloudLightning className="w-3.5 h-3.5 text-destructive" />;
  return <Cloud className="w-3.5 h-3.5 text-muted-foreground" />;
};

const DEFAULT_LAT = -34.6;
const DEFAULT_LON = -58.38;

export default function WeatherBar() {
  const { t } = useTranslation();
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const weatherLabel = (code: number): string => {
    if (code === 0) return t("weather.clear");
    if (code === 1) return t("weather.mostlyClear");
    if (code === 2) return t("weather.partlyCloudy");
    if (code === 3) return t("weather.cloudy");
    if (code <= 48) return t("weather.fog");
    if (code <= 57) return t("weather.drizzle");
    if (code <= 67) return t("weather.rain");
    if (code <= 77) return t("weather.snow");
    if (code <= 82) return t("weather.showers");
    if (code <= 99) return t("weather.storm");
    return "—";
  };

  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`
        );
        const data = await res.json();
        if (data.current) {
          setWeather({
            temp: Math.round(data.current.temperature_2m),
            windSpeed: Math.round(data.current.wind_speed_10m),
            code: data.current.weather_code,
          });
        }
      } catch {
        // silently fail
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(DEFAULT_LAT, DEFAULT_LON),
        { timeout: 3000 }
      );
    } else {
      fetchWeather(DEFAULT_LAT, DEFAULT_LON);
    }
  }, []);

  if (!weather) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-1.5 px-4 rounded-full bg-secondary/50 border border-border/50 text-[11px] text-muted-foreground font-heading mx-auto w-fit">
      {weatherIcon(weather.code)}
      <span>{weather.temp}°C</span>
      <span className="text-border">·</span>
      <span>{weatherLabel(weather.code)}</span>
      <span className="text-border">·</span>
      <Wind className="w-3 h-3" />
      <span>{weather.windSpeed} km/h</span>
    </div>
  );
}
