/**
 * Weather App
 * A React Native weather application with animated weather effects
 *
 * Features:
 * - Current weather display with location detection
 * - 5-day forecast
 * - Animated weather backgrounds (rain, snow, clouds, sun, night)
 * - Temperature unit toggle (Celsius/Fahrenheit)
 * - City search functionality
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Vibration,
} from 'react-native';
import * as Location from 'expo-location';


// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;
const API_BASE_URL = 'https://api.openweathermap.org/data/2.5';

/**
 * Color themes for different weather conditions
 * Each theme includes background color, card background, and accent color
 */
const WEATHER_THEMES = {
  thunderstorm: {
    background: '#0a0814',
    cardBg: 'rgba(255, 255, 255, 0.08)',
    accent: '#9D7BD8',
  },
  rain: {
    background: '#0f0f1a',
    cardBg: 'rgba(255, 255, 255, 0.08)',
    accent: '#6B8DD6',
  },
  snow: {
    background: '#3a4a5a',
    cardBg: 'rgba(255, 255, 255, 0.1)',
    accent: '#A8D5E5',
  },
  cloudy: {
    background: '#2d3a4a',
    cardBg: 'rgba(255, 255, 255, 0.08)',
    accent: '#8EAEC4',
  },
  sunny: {
    background: '#4A90A4',
    cardBg: 'rgba(255, 255, 255, 0.15)',
    accent: '#FFD93D',
  },
  night: {
    background: '#0a0a1a',
    cardBg: 'rgba(255, 255, 255, 0.06)',
    accent: '#C9B8FF',
  },
  default: {
    background: '#1a2a3a',
    cardBg: 'rgba(255, 255, 255, 0.08)',
    accent: '#64B5F6',
  },
};


// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Returns the URL for a weather icon from OpenWeatherMap
 * @param {string} iconCode - The icon code from the API (e.g., '01d', '10n')
 */
const getWeatherIconUrl = (iconCode) => {
  return `https://openweathermap.org/img/wn/${iconCode}@4x.png`;
};

/**
 * Determines the weather type based on API response data
 * Used to select the appropriate theme and animation
 *
 * Weather ID ranges (from OpenWeatherMap API):
 * - 200-299: Thunderstorm
 * - 300-399: Drizzle
 * - 500-599: Rain
 * - 600-699: Snow
 * - 700-799: Atmosphere (mist, fog, etc.)
 * - 800: Clear
 * - 801-804: Clouds
 *
 * @param {object} weatherData - The weather data from the API
 * @returns {string} - Weather type: 'rain', 'snow', 'cloudy', 'sunny', 'night', or 'default'
 */
const getWeatherType = (weatherData) => {
  if (!weatherData) return 'default';

  const iconCode = weatherData.weather[0].icon;
  const weatherId = weatherData.weather[0].id;
  const isNight = iconCode.includes('n');

  // Thunderstorm
  if (weatherId >= 200 && weatherId < 300) return 'thunderstorm';

  // Drizzle or Rain
  if (weatherId >= 300 && weatherId < 600) return 'rain';

  // Snow
  if (weatherId >= 600 && weatherId < 700) return 'snow';

  // Cloudy (but show night animation if it's nighttime)
  if (weatherId >= 801 && weatherId <= 804) return isNight ? 'night' : 'cloudy';

  // Clear sky
  if (weatherId === 800) return isNight ? 'night' : 'sunny';

  // Atmosphere (mist, fog, haze, etc.)
  if (weatherId >= 700 && weatherId < 800) return 'cloudy';

  return isNight ? 'night' : 'default';
};

/**
 * Formats a date string into a readable day name
 * Returns 'Today', 'Tomorrow', or the short weekday name
 *
 * @param {string} dateString - ISO date string from the API
 * @returns {string} - Formatted day name
 */
const formatDayName = (dateString) => {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

/**
 * Formats a Unix timestamp into a readable time string
 * Adjusts for the location's timezone
 *
 * @param {number} timestamp - Unix timestamp in seconds
 * @param {number} timezoneOffset - Timezone offset in seconds from UTC
 * @returns {string} - Formatted time (e.g., "6:42 AM")
 */
const formatTime = (timestamp, timezoneOffset) => {
  // Create date from timestamp and adjust for timezone
  const date = new Date((timestamp + timezoneOffset) * 1000);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const minuteStr = minutes.toString().padStart(2, '0');
  return `${hour12}:${minuteStr} ${ampm}`;
};

/**
 * Formats a Unix timestamp into hour only (for hourly forecast)
 *
 * @param {number} timestamp - Unix timestamp in seconds
 * @param {number} timezoneOffset - Timezone offset in seconds from UTC
 * @returns {string} - Formatted hour (e.g., "3 PM", "Now")
 */
const formatHour = (timestamp, timezoneOffset, isFirst = false) => {
  if (isFirst) return 'Now';
  const date = new Date((timestamp + timezoneOffset) * 1000);
  const hours = date.getUTCHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}${ampm}`;
};

/**
 * Converts wind direction in degrees to compass direction
 *
 * @param {number} degrees - Wind direction in degrees (0-360)
 * @returns {string} - Compass direction (e.g., "N", "NE", "E")
 */
const getWindDirection = (degrees) => {
  if (degrees === undefined) return '';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
};

/**
 * Returns a description and color for UV index value
 *
 * @param {number} uvi - UV index value
 * @returns {object} - Label and color for the UV level
 */
const getUVLevel = (uvi) => {
  if (uvi <= 2) return { label: 'Low', color: '#4CAF50' };
  if (uvi <= 5) return { label: 'Moderate', color: '#FFEB3B' };
  if (uvi <= 7) return { label: 'High', color: '#FF9800' };
  if (uvi <= 10) return { label: 'Very High', color: '#F44336' };
  return { label: 'Extreme', color: '#9C27B0' };
};

/**
 * Formats visibility in meters to km
 *
 * @param {number} meters - Visibility in meters
 * @returns {string} - Formatted visibility (e.g., "10 km")
 */
const formatVisibility = (meters) => {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${km % 1 === 0 ? km : km.toFixed(1)} km`;
  }
  return `${meters} m`;
};

/**
 * Calculates dew point from temperature and humidity
 *
 * @param {number} tempCelsius - Temperature in Celsius
 * @param {number} humidity - Relative humidity percentage
 * @returns {number} - Dew point in Celsius
 */
const calculateDewPoint = (tempCelsius, humidity) => {
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * tempCelsius) / (b + tempCelsius)) + Math.log(humidity / 100);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint);
};


// ============================================================================
// WEATHER ANIMATION COMPONENTS
// ============================================================================

// ----- RAIN ANIMATION -----

/**
 * Individual raindrop component
 * Animates falling from top to bottom with fading opacity
 */
const Raindrop = ({ delay, startX }) => {
  const translateY = useRef(new Animated.Value(-50)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;
  const fallDuration = useRef(600 + Math.random() * 400).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animate = () => {
        // Reset position and opacity
        translateY.setValue(-50);
        opacity.setValue(0.7);

        // Animate falling and fading
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT + 50,
            duration: fallDuration,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.3,
            duration: fallDuration,
            useNativeDriver: true,
          }),
        ]).start(() => animate()); // Loop continuously
      };
      animate();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.raindrop,
        {
          left: startX,
          transform: [{ translateY }],
          opacity
        }
      ]}
    />
  );
};

/**
 * Rain animation container
 * Renders multiple raindrops across the screen
 */
const RainAnimation = () => {
  const raindrops = useMemo(() =>
    Array.from({ length: 100 }, (_, i) => ({
      id: i,
      delay: Math.random() * 1000,
      startX: Math.random() * SCREEN_WIDTH,
    })),
  []);

  return (
    <View style={styles.animationContainer}>
      {raindrops.map((drop) => (
        <Raindrop
          key={drop.id}
          delay={drop.delay}
          startX={drop.startX}
        />
      ))}
    </View>
  );
};

/**
 * Splash effect when rain hits a surface
 * Shows an expanding ring with droplets
 */
const RainSplash = ({ onComplete }) => {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const posX = useRef(Math.random() * 60 + 20).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1.5,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => onComplete && onComplete());
  }, []);

  return (
    <Animated.View
      style={[
        styles.splash,
        {
          left: `${posX}%`,
          transform: [{ scale }],
          opacity,
        },
      ]}
    >
      <View style={styles.splashRing} />
      <View style={styles.splashDrop} />
      <View style={[styles.splashDroplet, { left: -14, top: -6 }]} />
      <View style={[styles.splashDroplet, { right: -14, top: -6 }]} />
      <View style={[styles.splashDroplet, { left: -6, top: -14 }]} />
      <View style={[styles.splashDroplet, { right: -6, top: -14 }]} />
      <View style={[styles.splashDropletSmall, { left: -10, top: -12 }]} />
      <View style={[styles.splashDropletSmall, { right: -10, top: -12 }]} />
    </Animated.View>
  );
};

/**
 * Manages multiple splash effects on stat cards
 * Randomly spawns splashes when it's raining
 */
const SplashContainer = ({ isRaining }) => {
  const [splashes, setSplashes] = useState([]);
  const splashIdRef = useRef(0);

  useEffect(() => {
    if (!isRaining) return;

    const interval = setInterval(() => {
      // 60% chance to spawn a splash every 500ms
      if (Math.random() < 0.6) {
        const newId = splashIdRef.current++;
        setSplashes(prev => [...prev, newId]);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isRaining]);

  const removeSplash = (id) => {
    setSplashes(prev => prev.filter(s => s !== id));
  };

  if (!isRaining) return null;

  return (
    <>
      {splashes.map(id => (
        <RainSplash key={id} onComplete={() => removeSplash(id)} />
      ))}
    </>
  );
};


// ----- THUNDERSTORM ANIMATION -----

/**
 * Lightning bolt component
 * Creates a flashing lightning effect across the screen
 */
const LightningBolt = ({ onComplete }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const leftPosition = useRef(Math.random() * 60 + 20).current; // 20% to 80%
  const boltShape = useRef(Math.random() > 0.5 ? 1 : 2).current; // Randomize bolt shape

  useEffect(() => {
    // Quick flash sequence
    Animated.sequence([
      // First flash
      Animated.timing(opacity, {
        toValue: 0.9,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      // Second flash (brighter)
      Animated.timing(opacity, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete && onComplete());
  }, []);

  return (
    <Animated.View
      style={[
        styles.lightningBolt,
        boltShape === 1 ? styles.lightningBolt1 : styles.lightningBolt2,
        {
          left: `${leftPosition}%`,
          opacity,
        },
      ]}
    />
  );
};

/**
 * Screen flash effect during lightning
 * Illuminates the entire screen briefly
 */
const LightningFlash = ({ onComplete }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.3,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.5,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete && onComplete());
  }, []);

  return <Animated.View style={[styles.lightningFlash, { opacity }]} />;
};

/**
 * Thunderstorm animation container
 * Heavy rain with periodic lightning flashes
 */
const ThunderstormAnimation = () => {
  const [lightning, setLightning] = useState([]);
  const lightningIdRef = useRef(0);

  // Rain effect (same as rain animation but heavier)
  const raindrops = useMemo(() =>
    Array.from({ length: 120 }, (_, i) => ({
      id: i,
      delay: Math.random() * 1000,
      startX: Math.random() * SCREEN_WIDTH,
    })),
  []);

  // Lightning effect
  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    const triggerLightning = () => {
      if (!isMounted) return; // Stop if component is unmounted

      const newId = lightningIdRef.current++;
      setLightning(prev => [...prev, newId]);

      // Vibrate phone on lightning strike (short rumble like thunder)
      // Pattern: [delay, vibrate, delay, vibrate] in milliseconds
      Vibration.vibrate([0, 100, 50, 150]);

      // Schedule next lightning (random interval 2-6 seconds)
      const nextStrike = 2000 + Math.random() * 4000;
      timeoutId = setTimeout(triggerLightning, nextStrike);
    };

    // Start first lightning after 1 second
    timeoutId = setTimeout(triggerLightning, 1000);

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const removeLightning = (id) => {
    setLightning(prev => prev.filter(l => l !== id));
  };

  return (
    <View style={styles.animationContainer}>
      {/* Heavy rain */}
      {raindrops.map((drop) => (
        <Raindrop
          key={drop.id}
          delay={drop.delay}
          startX={drop.startX}
        />
      ))}

      {/* Lightning bolts and flashes */}
      {lightning.map(id => (
        <View key={id}>
          <LightningBolt onComplete={() => removeLightning(id)} />
          <LightningFlash onComplete={() => {}} />
        </View>
      ))}
    </View>
  );
};


// ----- SNOW PILE EFFECT (for stat cards) -----

/**
 * Individual snowflake that falls and settles on stat cards
 * Accumulates at the bottom to create a piling effect
 */
const SnowPile = ({ onComplete, delay = 0, finalPosition }) => {
  const translateY = useRef(new Animated.Value(-20)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  // Random properties for each snowflake
  const leftPosition = useRef(Math.random() * 80 + 10).current; // 10% to 90%
  const flakeSize = useRef(6 + Math.random() * 4).current;

  useEffect(() => {
    // Small horizontal drift while falling
    const driftAmount = (Math.random() - 0.5) * 20;

    setTimeout(() => {
      Animated.parallel([
        // Fall down to final position
        Animated.timing(translateY, {
          toValue: finalPosition,
          duration: 1200 + Math.random() * 400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        // Slight horizontal drift
        Animated.timing(translateX, {
          toValue: driftAmount,
          duration: 1200 + Math.random() * 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // Gentle rotation
        Animated.timing(rotate, {
          toValue: (Math.random() - 0.5) * 60,
          duration: 1200 + Math.random() * 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();

      // Remove after settling for a while
      setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }).start(() => onComplete && onComplete());
      }, 3000);
    }, delay);
  }, []);

  return (
    <Animated.View
      style={[
        styles.snowPileFlake,
        {
          left: `${leftPosition}%`,
          width: flakeSize,
          height: flakeSize,
          borderRadius: flakeSize / 2,
          transform: [
            { translateY },
            { translateX },
            { rotate: rotate.interpolate({
                inputRange: [-60, 60],
                outputRange: ['-60deg', '60deg'],
              })
            }
          ],
          opacity,
        },
      ]}
    />
  );
};

/**
 * Manages multiple snowflakes piling up on stat cards
 * Randomly spawns snowflakes when it's snowing
 */
const SnowPileContainer = ({ isSnowing }) => {
  const [snowflakes, setSnowflakes] = useState([]);
  const snowIdRef = useRef(0);

  useEffect(() => {
    if (!isSnowing) return;

    const interval = setInterval(() => {
      // 50% chance to spawn a snowflake every 400ms
      if (Math.random() < 0.5) {
        const newId = snowIdRef.current++;
        // Random vertical position where the snowflake will settle (bottom of card)
        const finalPosition = 50 - (Math.random() * 15);
        setSnowflakes(prev => [...prev, { id: newId, finalPosition }]);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isSnowing]);

  const removeSnowflake = (id) => {
    setSnowflakes(prev => prev.filter(s => s.id !== id));
  };

  if (!isSnowing) return null;

  return (
    <>
      {snowflakes.map(flake => (
        <SnowPile
          key={flake.id}
          finalPosition={flake.finalPosition}
          onComplete={() => removeSnowflake(flake.id)}
        />
      ))}
    </>
  );
};


// ----- SNOW ANIMATION -----

/**
 * Individual snowflake component
 * Falls slowly while drifting side-to-side
 */
const Snowflake = ({ delay, startX, size }) => {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;
  const fallDuration = useRef(5000 + Math.random() * 3000).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const animate = () => {
        translateY.setValue(-50);
        translateX.setValue(0);
        opacity.setValue(0.8);

        // Vertical falling animation
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT + 50,
          duration: fallDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(() => animate());

        // Horizontal drift animation (runs separately)
        Animated.loop(
          Animated.sequence([
            Animated.timing(translateX, {
              toValue: 25,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(translateX, {
              toValue: -25,
              duration: 1500,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        ).start();
      };
      animate();
    }, delay);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.snowflake,
        {
          left: startX,
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ translateY }, { translateX }],
          opacity,
        },
      ]}
    />
  );
};

/**
 * Snow animation container
 * Renders multiple snowflakes of varying sizes
 */
const SnowAnimation = () => {
  const snowflakes = useMemo(() =>
    Array.from({ length: 45 }, (_, i) => ({
      id: i,
      delay: Math.random() * 3000,
      startX: Math.random() * SCREEN_WIDTH,
      size: 3 + Math.random() * 6,
    })),
  []);

  return (
    <View style={styles.animationContainer}>
      {snowflakes.map((flake) => (
        <Snowflake
          key={flake.id}
          delay={flake.delay}
          startX={flake.startX}
          size={flake.size}
        />
      ))}
    </View>
  );
};


// ----- CLOUD ANIMATION -----

/**
 * Individual cloud component
 * Drifts horizontally across the screen
 */
const Cloud = ({ delay, startY, size, speed }) => {
  const translateX = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;

    const animate = () => {
      if (!isMounted) return;

      translateX.setValue(-200);
      opacity.setValue(0);

      Animated.parallel([
        // Move across screen
        Animated.timing(translateX, {
          toValue: SCREEN_WIDTH + 200,
          duration: speed,
          delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // Fade in, hold, fade out
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 2000,
            delay,
            useNativeDriver: true
          }),
          Animated.delay(speed - 6000),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true
          }),
        ]),
      ]).start(() => {
        if (isMounted) animate();
      });
    };
    animate();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.cloud,
        {
          top: startY,
          width: size,
          height: size * 0.5,
          borderRadius: size * 0.25,
          transform: [{ translateX }],
          opacity,
        },
      ]}
    />
  );
};

/**
 * Cloudy animation container
 * Renders multiple drifting clouds
 */
const CloudyAnimation = () => {
  const clouds = useMemo(() =>
    Array.from({ length: 5 }, (_, i) => ({
      id: i,
      delay: i * 4000,
      startY: 100 + Math.random() * 150,
      size: 120 + Math.random() * 80,
      speed: 20000 + Math.random() * 10000,
    })),
  []);

  return (
    <View style={styles.animationContainer}>
      {clouds.map((cloud) => (
        <Cloud
          key={cloud.id}
          delay={cloud.delay}
          startY={cloud.startY}
          size={cloud.size}
          speed={cloud.speed}
        />
      ))}
    </View>
  );
};


// ----- SUNNY ANIMATION -----

/**
 * Sunny day animation
 * Shows a pulsing golden glow in the top-left corner
 */
const SunnyAnimation = () => {
  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const glowScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        // Pulse opacity
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.7,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.4,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
        ]),
        // Pulse scale
        Animated.sequence([
          Animated.timing(glowScale, {
            toValue: 1.15,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(glowScale, {
            toValue: 1,
            duration: 4000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
        ]),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  return (
    <View style={styles.animationContainer}>
      <Animated.View
        style={[
          styles.sunGlow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }]
          }
        ]}
      />
    </View>
  );
};


// ----- NIGHT ANIMATION -----

/**
 * Individual star component
 * Twinkles by fading in and out
 */
const Star = ({ x, y, size, delay }) => {
  const opacity = useRef(new Animated.Value(0.1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 1500 + Math.random() * 1500,
          delay,
          useNativeDriver: true
        }),
        Animated.timing(opacity, {
          toValue: 0.1,
          duration: 1500 + Math.random() * 1500,
          useNativeDriver: true
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity
        }
      ]}
    />
  );
};

/**
 * Night animation container
 * Renders twinkling stars and a glowing moon
 */
const NightAnimation = () => {
  const moonGlow = useRef(new Animated.Value(0.2)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(moonGlow, {
          toValue: 0.5,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(moonGlow, {
          toValue: 0.2,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  const stars = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * SCREEN_WIDTH,
      y: Math.random() * (SCREEN_HEIGHT * 0.6),
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 3000,
    })),
  []);

  return (
    <View style={styles.animationContainer}>
      {/* Stars */}
      {stars.map((star) => (
        <Star
          key={star.id}
          x={star.x}
          y={star.y}
          size={star.size}
          delay={star.delay}
        />
      ))}

      {/* Moon with glow and craters */}
      <View style={styles.moonContainer}>
        <Animated.View style={[styles.moonGlow, { opacity: moonGlow }]} />
        <View style={styles.moon}>
          <View style={styles.moonCrater1} />
          <View style={styles.moonCrater2} />
          <View style={styles.moonCrater3} />
        </View>
      </View>
    </View>
  );
};


// ----- QUADRANT SHOWCASE (for landing page) -----

/**
 * 6-quadrant weather showcase for the landing page (2 rows x 3 columns)
 * Shows different weather effects in each quadrant
 */
const QuadrantShowcase = () => {
  return (
    <View style={styles.quadrantContainer}>
      {/* Top Row */}
      {/* Top Left - Sunny */}
      <View style={[styles.quadrant6, styles.quadrantTopLeft6, { backgroundColor: WEATHER_THEMES.sunny.background }]}>
        <SunnyAnimation />
      </View>

      {/* Top Center - Snow */}
      <View style={[styles.quadrant6, styles.quadrantTopCenter6, { backgroundColor: WEATHER_THEMES.snow.background }]}>
        <SnowAnimation />
      </View>

      {/* Top Right - Rain */}
      <View style={[styles.quadrant6, styles.quadrantTopRight6, { backgroundColor: WEATHER_THEMES.rain.background }]}>
        <RainAnimation />
      </View>

      {/* Bottom Row */}
      {/* Bottom Left - Thunderstorm */}
      <View style={[styles.quadrant6, styles.quadrantBottomLeft6, { backgroundColor: WEATHER_THEMES.thunderstorm.background }]}>
        <ThunderstormAnimation />
      </View>

      {/* Bottom Center - Cloudy */}
      <View style={[styles.quadrant6, styles.quadrantBottomCenter6, { backgroundColor: WEATHER_THEMES.cloudy.background }]}>
        <CloudyAnimation />
      </View>

      {/* Bottom Right - Night */}
      <View style={[styles.quadrant6, styles.quadrantBottomRight6, { backgroundColor: WEATHER_THEMES.night.background }]}>
        <NightAnimation />
      </View>

      {/* Center overlay with app title */}
      <View style={styles.showcaseOverlay}>
        {/* Decorative corner accents */}
        <View style={styles.cornerAccent1} />
        <View style={styles.cornerAccent2} />
        <View style={styles.cornerAccent3} />
        <View style={styles.cornerAccent4} />

        <Text style={styles.showcaseTitle}>Worldwide Weather</Text>
        <View style={styles.showcaseDivider} />
        <Text style={styles.showcaseSubtitle}>Search for a city to get started</Text>
      </View>
    </View>
  );
};


// ----- ANIMATION SELECTOR -----

/**
 * Selects and renders the appropriate weather animation
 * based on the current weather type
 */
const WeatherAnimation = ({ weatherType, showQuadrantShowcase }) => {
  // Show 6-quadrant showcase on initial load
  if (showQuadrantShowcase) {
    return <QuadrantShowcase />;
  }

  // Normal single weather animation
  switch (weatherType) {
    case 'thunderstorm': return <ThunderstormAnimation />;
    case 'rain':         return <RainAnimation />;
    case 'snow':         return <SnowAnimation />;
    case 'cloudy':       return <CloudyAnimation />;
    case 'sunny':        return <SunnyAnimation />;
    case 'night':        return <NightAnimation />;
    default:             return null;
  }
};


// ============================================================================
// FORECAST ICON COMPONENT
// ============================================================================

/**
 * Custom icons for the 5-day forecast
 * Displays weather-appropriate icons for each condition
 */
const ForecastIcon = ({ condition, iconCode }) => {
  const isNight = iconCode.includes('n');
  const conditionLower = condition.toLowerCase();

  // Clear sky - sun or moon
  if (conditionLower === 'clear') {
    if (isNight) {
      return (
        <View style={styles.customIcon}>
          <View style={styles.nightMoon}>
            <View style={styles.nightMoonInner} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.customIcon}>
        <View style={styles.clearSun}>
          <View style={styles.clearSunInner} />
        </View>
      </View>
    );
  }

  // Clouds
  if (conditionLower === 'clouds') {
    return (
      <View style={styles.customIcon}>
        <View style={styles.miniCloud}>
          <View style={styles.miniCloudPuff1} />
          <View style={styles.miniCloudPuff2} />
          <View style={styles.miniCloudPuff3} />
          <View style={styles.miniCloudBase} />
        </View>
      </View>
    );
  }

  // Rain, Drizzle, or Thunderstorm
  if (['rain', 'drizzle', 'thunderstorm'].includes(conditionLower)) {
    return (
      <View style={styles.customIcon}>
        <View style={styles.miniRainCloud}>
          <View style={styles.miniCloudPuff1Small} />
          <View style={styles.miniCloudPuff2Small} />
          <View style={styles.miniCloudBaseSmall} />
        </View>
        <View style={styles.miniRainDrops}>
          <View style={styles.miniRainDrop} />
          <View style={[styles.miniRainDrop, { marginLeft: 6, marginTop: 4 }]} />
          <View style={[styles.miniRainDrop, { marginLeft: 6, marginTop: -2 }]} />
        </View>
      </View>
    );
  }

  // Snow
  if (conditionLower === 'snow') {
    return (
      <View style={styles.customIcon}>
        <View style={styles.miniSnowCloud}>
          <View style={styles.miniCloudPuff1Small} />
          <View style={styles.miniCloudPuff2Small} />
          <View style={styles.miniCloudBaseSmall} />
        </View>
        <View style={styles.miniSnowflakes}>
          <Text style={styles.miniSnowflake}>*</Text>
          <Text style={[styles.miniSnowflake, { marginLeft: 4, marginTop: 2 }]}>*</Text>
          <Text style={[styles.miniSnowflake, { marginLeft: 4, marginTop: -1 }]}>*</Text>
        </View>
      </View>
    );
  }

  // Mist, Fog, Haze, Smoke, Dust
  if (['mist', 'fog', 'haze', 'smoke', 'dust'].includes(conditionLower)) {
    return (
      <View style={styles.customIcon}>
        <View style={styles.miniMist}>
          <View style={styles.miniMistLine} />
          <View style={[styles.miniMistLine, { width: 24, marginTop: 5 }]} />
          <View style={[styles.miniMistLine, { width: 20, marginTop: 5 }]} />
        </View>
      </View>
    );
  }

  // Fallback to API icon
  return (
    <Image
      source={{ uri: getWeatherIconUrl(iconCode) }}
      style={styles.forecastIcon}
    />
  );
};


// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  // ----- STATE -----
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [oneCallData, setOneCallData] = useState(null); // UV, hourly, minutely, alerts
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [weatherType, setWeatherType] = useState('default');
  const [isCelsius, setIsCelsius] = useState(false);
  const [hasLoadedWeather, setHasLoadedWeather] = useState(false); // Track if any weather has been loaded

  // ----- DERIVED VALUES -----
  const theme = WEATHER_THEMES[weatherType] || WEATHER_THEMES.default;
  const tempUnit = '°';
  const unitLabel = isCelsius ? 'C' : 'F';

  // ----- HELPER FUNCTIONS -----

  /**
   * Converts temperature from Celsius to Fahrenheit if needed
   */
  const convertTemp = (tempCelsius) => {
    if (isCelsius) return Math.round(tempCelsius);
    return Math.round((tempCelsius * 9 / 5) + 32);
  };

  // ----- API FUNCTIONS -----

  /**
   * Fetches One Call API data for UV, hourly, minutely, and alerts
   * Note: One Call API 3.0 requires a separate subscription
   * Falls back gracefully if not available
   */
  const fetchOneCallData = async (lat, lon) => {
    try {
      // Try One Call API 3.0 first
      const response = await fetch(
        `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&exclude=daily`
      );

      if (response.ok) {
        const data = await response.json();
        setOneCallData(data);
        return;
      }

      // If 3.0 fails, try 2.5 (older free version)
      const response25 = await fetch(
        `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&exclude=daily`
      );

      if (response25.ok) {
        const data = await response25.json();
        setOneCallData(data);
      } else {
        // One Call not available, set to null
        setOneCallData(null);
      }
    } catch (err) {
      console.log('One Call API not available:', err.message);
      setOneCallData(null);
    }
  };

  /**
   * Fetches weather data by city name
   */
  const fetchWeatherByCity = async (cityName) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current weather
      const weatherResponse = await fetch(
        `${API_BASE_URL}/weather?q=${cityName}&appid=${API_KEY}&units=metric`
      );
      if (!weatherResponse.ok) throw new Error('City not found');
      const weatherData = await weatherResponse.json();
      setWeather(weatherData);
      setHasLoadedWeather(true); // Mark that we've loaded weather

      // Fetch One Call data using coordinates from weather response
      fetchOneCallData(weatherData.coord.lat, weatherData.coord.lon);

      // Fetch 5-day forecast
      const forecastResponse = await fetch(
        `${API_BASE_URL}/forecast?q=${cityName}&appid=${API_KEY}&units=metric`
      );
      const forecastData = await forecastResponse.json();

      // Filter to get one reading per day (at noon)
      setForecast(
        forecastData.list.filter((item) => item.dt_txt.includes('12:00:00'))
      );
    } catch (err) {
      setError(err.message);
      setWeather(null);
      setForecast([]);
      setOneCallData(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches weather data by coordinates
   */
  const fetchWeatherByCoords = async (lat, lon) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current weather
      const weatherResponse = await fetch(
        `${API_BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
      );
      const weatherData = await weatherResponse.json();
      setWeather(weatherData);
      setCity(weatherData.name);
      setHasLoadedWeather(true); // Mark that we've loaded weather

      // Fetch One Call data for UV, hourly, minutely, alerts
      fetchOneCallData(lat, lon);

      // Fetch 5-day forecast
      const forecastResponse = await fetch(
        `${API_BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
      );
      const forecastData = await forecastResponse.json();
      setForecast(
        forecastData.list.filter((item) => item.dt_txt.includes('12:00:00'))
      );
    } catch (err) {
      setError('Failed to fetch weather data');
      setOneCallData(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Gets user's current location and fetches weather
   */
  const getLocation = async () => {
    try {
      setLoading(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      await fetchWeatherByCoords(
        location.coords.latitude,
        location.coords.longitude
      );
    } catch (err) {
      setError('Could not get location');
      setLoading(false);
    }
  };

  // ----- EVENT HANDLERS -----

  const handleSearch = () => {
    if (city.trim()) {
      fetchWeatherByCity(city.trim());
    }
  };

  const toggleTemperatureUnit = () => {
    setIsCelsius(!isCelsius);
  };

  // ----- EFFECTS -----

  // Update weather type when weather data changes
  useEffect(() => {
    if (weather) {
      setWeatherType(getWeatherType(weather));
    }
  }, [weather]);

  // ----- RENDER -----
  return (
    <View style={[styles.container, { backgroundColor: hasLoadedWeather ? theme.background : '#1a2a3a' }]}>
      <StatusBar style="light" />

      {/* Background Animation */}
      <WeatherAnimation weatherType={weatherType} showQuadrantShowcase={!hasLoadedWeather} />

      {/* Main Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: Location Button & Unit Toggle */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.locationBtn}
            onPress={getLocation}
            activeOpacity={0.7}
          >
            <Text style={styles.locationIcon}>&#9737;</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.unitToggle, { backgroundColor: theme.cardBg }]}
            onPress={toggleTemperatureUnit}
            activeOpacity={0.8}
          >
            <View style={[
              styles.unitOption,
              isCelsius && { backgroundColor: theme.accent }
            ]}>
              <Text style={[
                styles.unitText,
                isCelsius && styles.unitTextActive
              ]}>C</Text>
            </View>
            <View style={[
              styles.unitOption,
              !isCelsius && { backgroundColor: theme.accent }
            ]}>
              <Text style={[
                styles.unitText,
                !isCelsius && styles.unitTextActive
              ]}>F</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: hasLoadedWeather ? theme.cardBg : 'rgba(255, 255, 255, 0.2)' }]}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search city..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={city}
            onChangeText={setCity}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: hasLoadedWeather ? theme.accent : 'rgba(255, 255, 255, 0.3)' }]}
            onPress={handleSearch}
            activeOpacity={0.8}
          >
            <Text style={styles.searchBtnText}>Go</Text>
          </TouchableOpacity>
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.loadingText}>Fetching weather...</Text>
          </View>
        )}

        {/* Error State */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.cardBg }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Weather Content */}
        {weather && !loading && (
          <>
            {/* Current Weather */}
            <View style={styles.currentWeatherSection}>
              <Text style={styles.locationName}>{weather.name}</Text>
              <Text style={styles.countryName}>{weather.sys.country}</Text>

              <View style={styles.tempContainer}>
                <Image
                  source={{ uri: getWeatherIconUrl(weather.weather[0].icon) }}
                  style={styles.mainIcon}
                />
                <View style={styles.tempInfo}>
                  <Text style={styles.mainTemp}>
                    {convertTemp(weather.main.temp)}
                    <Text style={styles.tempDegree}>{tempUnit}{unitLabel}</Text>
                  </Text>
                  <Text style={styles.weatherDesc}>
                    {weather.weather[0].description}
                  </Text>
                </View>
              </View>

              <Text style={styles.feelsLike}>
                Feels like {convertTemp(weather.main.feels_like)}°
              </Text>

              {/* Min/Max Temperature */}
              <View style={styles.minMaxContainer}>
                <Text style={styles.minMaxText}>
                  H: {convertTemp(weather.main.temp_max)}°
                </Text>
                <Text style={styles.minMaxDivider}>•</Text>
                <Text style={styles.minMaxText}>
                  L: {convertTemp(weather.main.temp_min)}°
                </Text>
              </View>

              {/* Sunrise/Sunset */}
              <View style={styles.sunTimesContainer}>
                <View style={styles.sunTimeItem}>
                  <Text style={styles.sunTimeIcon}>☀</Text>
                  <Text style={styles.sunTimeValue}>
                    {formatTime(weather.sys.sunrise, weather.timezone)}
                  </Text>
                </View>
                <View style={styles.sunTimeItem}>
                  <Text style={styles.sunTimeIcon}>☽</Text>
                  <Text style={styles.sunTimeValue}>
                    {formatTime(weather.sys.sunset, weather.timezone)}
                  </Text>
                </View>
              </View>

              {/* Rain Volume (only when raining) */}
              {weather.rain && (
                <View style={[styles.precipitationBadge, { backgroundColor: theme.cardBg }]}>
                  <Text style={styles.precipitationIcon}>🌧</Text>
                  <Text style={styles.precipitationText}>
                    {weather.rain['1h'] ? `${weather.rain['1h']} mm/h` : `${weather.rain['3h']} mm (3h)`}
                  </Text>
                </View>
              )}

              {/* Snow Volume (only when snowing) */}
              {weather.snow && (
                <View style={[styles.precipitationBadge, { backgroundColor: theme.cardBg }]}>
                  <Text style={styles.precipitationIcon}>❄</Text>
                  <Text style={styles.precipitationText}>
                    {weather.snow['1h'] ? `${weather.snow['1h']} mm/h` : `${weather.snow['3h']} mm (3h)`}
                  </Text>
                </View>
              )}
            </View>

            {/* Stats Cards - Row 1 */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.cardBg }]}>
                <SplashContainer isRaining={weatherType === 'rain' || weatherType === 'thunderstorm'} />
                <SnowPileContainer isSnowing={weatherType === 'snow'} />
                <Text style={styles.statValue}>{weather.main.humidity}%</Text>
                <Text style={styles.statLabel}>Humidity</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.cardBg }]}>
                <SplashContainer isRaining={weatherType === 'rain' || weatherType === 'thunderstorm'} />
                <SnowPileContainer isSnowing={weatherType === 'snow'} />
                <Text style={styles.statValue}>
                  {Math.round(weather.wind.speed)} m/s {getWindDirection(weather.wind.deg)}
                </Text>
                <Text style={styles.statLabel}>Wind</Text>
                {weather.wind.gust && (
                  <Text style={styles.statSubValue}>
                    Gusts: {Math.round(weather.wind.gust)} m/s
                  </Text>
                )}
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.cardBg }]}>
                <SplashContainer isRaining={weatherType === 'rain' || weatherType === 'thunderstorm'} />
                <SnowPileContainer isSnowing={weatherType === 'snow'} />
                <Text style={styles.statValue}>{weather.main.pressure}</Text>
                <Text style={styles.statLabel}>hPa</Text>
              </View>
            </View>

            {/* Stats Cards - Row 2 */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.cardBg }]}>
                <SplashContainer isRaining={weatherType === 'rain' || weatherType === 'thunderstorm'} />
                <SnowPileContainer isSnowing={weatherType === 'snow'} />
                <Text style={styles.statValue}>{formatVisibility(weather.visibility)}</Text>
                <Text style={styles.statLabel}>Visibility</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.cardBg }]}>
                <SplashContainer isRaining={weatherType === 'rain' || weatherType === 'thunderstorm'} />
                <SnowPileContainer isSnowing={weatherType === 'snow'} />
                <Text style={styles.statValue}>{weather.clouds.all}%</Text>
                <Text style={styles.statLabel}>Cloudiness</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.cardBg }]}>
                <SplashContainer isRaining={weatherType === 'rain' || weatherType === 'thunderstorm'} />
                <SnowPileContainer isSnowing={weatherType === 'snow'} />
                <Text style={styles.statValue}>
                  {convertTemp(calculateDewPoint(weather.main.temp, weather.main.humidity))}°
                </Text>
                <Text style={styles.statLabel}>Dew Point</Text>
              </View>
            </View>

            {/* UV Index (from One Call API) */}
            {oneCallData?.current?.uvi !== undefined && (
              <View style={styles.uvSection}>
                <Text style={styles.sectionTitle}>UV Index</Text>
                <View style={[styles.uvCard, { backgroundColor: theme.cardBg }]}>
                  <View style={styles.uvContent}>
                    <Text style={[styles.uvValue, { color: getUVLevel(oneCallData.current.uvi).color }]}>
                      {Math.round(oneCallData.current.uvi)}
                    </Text>
                    <Text style={[styles.uvLabel, { color: getUVLevel(oneCallData.current.uvi).color }]}>
                      {getUVLevel(oneCallData.current.uvi).label}
                    </Text>
                  </View>
                  <View style={styles.uvBar}>
                    <View style={[styles.uvBarFill, {
                      width: `${Math.min(oneCallData.current.uvi / 11 * 100, 100)}%`,
                      backgroundColor: getUVLevel(oneCallData.current.uvi).color
                    }]} />
                  </View>
                </View>
              </View>
            )}

            {/* Weather Alerts (from One Call API) */}
            {oneCallData?.alerts && oneCallData.alerts.length > 0 && (
              <View style={styles.alertsSection}>
                <Text style={styles.sectionTitle}>Weather Alerts</Text>
                {oneCallData.alerts.map((alert, index) => (
                  <View key={index} style={[styles.alertCard, { backgroundColor: 'rgba(244, 67, 54, 0.15)' }]}>
                    <View style={styles.alertHeader}>
                      <Text style={styles.alertIcon}>⚠</Text>
                      <Text style={styles.alertTitle}>{alert.event}</Text>
                    </View>
                    <Text style={styles.alertSender}>{alert.sender_name}</Text>
                    <Text style={styles.alertDesc} numberOfLines={3}>
                      {alert.description}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Hourly Forecast (from One Call API) */}
            {oneCallData?.hourly && (
              <View style={styles.hourlySection}>
                <Text style={styles.sectionTitle}>Hourly Forecast</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={[styles.hourlyScroll, { backgroundColor: theme.cardBg }]}
                  contentContainerStyle={styles.hourlyScrollContent}
                >
                  {oneCallData.hourly.slice(0, 24).map((hour, index) => (
                    <View key={index} style={styles.hourlyItem}>
                      <Text style={styles.hourlyTime}>
                        {formatHour(hour.dt, oneCallData.timezone_offset, index === 0)}
                      </Text>
                      <Image
                        source={{ uri: getWeatherIconUrl(hour.weather[0].icon) }}
                        style={styles.hourlyIcon}
                      />
                      <Text style={styles.hourlyTemp}>
                        {convertTemp(hour.temp)}°
                      </Text>
                      {hour.pop > 0 && (
                        <Text style={styles.hourlyPop}>
                          {Math.round(hour.pop * 100)}%
                        </Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Minutely Precipitation (from One Call API) */}
            {oneCallData?.minutely && oneCallData.minutely.some(m => m.precipitation > 0) && (
              <View style={styles.minutelySection}>
                <Text style={styles.sectionTitle}>Precipitation (Next Hour)</Text>
                <View style={[styles.minutelyCard, { backgroundColor: theme.cardBg }]}>
                  <View style={styles.minutelyChart}>
                    {oneCallData.minutely.slice(0, 60).map((minute, index) => (
                      <View
                        key={index}
                        style={[
                          styles.minutelyBar,
                          {
                            height: Math.max(minute.precipitation * 20, 2),
                            backgroundColor: minute.precipitation > 0 ? theme.accent : 'rgba(255,255,255,0.1)',
                          }
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.minutelyLabels}>
                    <Text style={styles.minutelyLabel}>Now</Text>
                    <Text style={styles.minutelyLabel}>15m</Text>
                    <Text style={styles.minutelyLabel}>30m</Text>
                    <Text style={styles.minutelyLabel}>45m</Text>
                    <Text style={styles.minutelyLabel}>60m</Text>
                  </View>
                </View>
              </View>
            )}

            {/* 5-Day Forecast */}
            {forecast.length > 0 && (
              <View style={styles.forecastSection}>
                <Text style={styles.sectionTitle}>5-Day Forecast</Text>
                <View style={[styles.forecastCard, { backgroundColor: theme.cardBg }]}>
                  {forecast.map((day, index) => (
                    <View
                      key={index}
                      style={[
                        styles.forecastRow,
                        index !== forecast.length - 1 && styles.forecastRowBorder
                      ]}
                    >
                      <Text style={styles.forecastDay}>
                        {formatDayName(day.dt_txt)}
                      </Text>
                      <ForecastIcon
                        condition={day.weather[0].main}
                        iconCode={day.weather[0].icon}
                      />
                      <Text style={styles.forecastCondition}>
                        {day.weather[0].main}
                      </Text>
                      <Text style={styles.forecastTemp}>
                        {convertTemp(day.main.temp)}°
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}


// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // ----- LAYOUT -----
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
  },
  bottomSpacer: {
    height: 40,
  },

  // ----- ANIMATION CONTAINER -----
  animationContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    overflow: 'hidden',
  },

  // ----- QUADRANT SHOWCASE -----
  quadrantContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  // 6-quadrant layout (2x3 grid)
  quadrant6: {
    position: 'absolute',
    width: '33.333%',
    height: '50%',
    overflow: 'hidden',
  },
  quadrantTopLeft6: {
    top: 0,
    left: 0,
  },
  quadrantTopCenter6: {
    top: 0,
    left: '33.333%',
  },
  quadrantTopRight6: {
    top: 0,
    right: 0,
  },
  quadrantBottomLeft6: {
    bottom: 0,
    left: 0,
  },
  quadrantBottomCenter6: {
    bottom: 0,
    left: '33.333%',
  },
  quadrantBottomRight6: {
    bottom: 0,
    right: 0,
  },
  showcaseOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -170 }, { translateY: -80 }],
    width: 340,
    alignItems: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(15, 25, 35, 0.85)',
    paddingVertical: 40,
    paddingHorizontal: 30,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 10,
  },
  showcaseTitle: {
    fontSize: 38,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 3,
    marginBottom: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  showcaseDivider: {
    width: 60,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 16,
    borderRadius: 1,
  },
  showcaseSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    letterSpacing: 1.5,
    lineHeight: 20,
    fontWeight: '400',
  },
  // Corner accents
  cornerAccent1: {
    position: 'absolute',
    top: 15,
    left: 15,
    width: 20,
    height: 20,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderTopLeftRadius: 8,
  },
  cornerAccent2: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 20,
    height: 20,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderTopRightRadius: 8,
  },
  cornerAccent3: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    width: 20,
    height: 20,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomLeftRadius: 8,
  },
  cornerAccent4: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    width: 20,
    height: 20,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomRightRadius: 8,
  },

  // ----- HEADER -----
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  locationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 22,
    color: '#fff',
  },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 4,
  },
  unitOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  unitText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  unitTextActive: {
    color: '#000',
  },

  // ----- SEARCH -----
  searchContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 6,
    marginBottom: 32,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
  },
  searchBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
  },
  searchBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },

  // ----- LOADING & ERROR -----
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  errorContainer: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 15,
    fontWeight: '500',
  },

  // ----- CURRENT WEATHER -----
  currentWeatherSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  locationName: {
    fontSize: 32,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 1,
  },
  countryName: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    letterSpacing: 2,
  },
  tempContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  mainIcon: {
    width: 120,
    height: 120,
    marginRight: -10,
  },
  tempInfo: {
    alignItems: 'flex-start',
  },
  mainTemp: {
    fontSize: 72,
    fontWeight: '200',
    color: '#fff',
  },
  tempDegree: {
    fontSize: 28,
    fontWeight: '300',
  },
  weatherDesc: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'capitalize',
    marginTop: -8,
  },
  feelsLike: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 12,
  },

  // Min/Max Temperature
  minMaxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  minMaxText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  minMaxDivider: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginHorizontal: 10,
  },

  // Sunrise/Sunset
  sunTimesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 40,
  },
  sunTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sunTimeIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sunTimeValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },

  // Precipitation Badge (Rain/Snow)
  precipitationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
  },
  precipitationIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  precipitationText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },

  // ----- STATS CARDS -----
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 12,
  },
  statCard: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statSubValue: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },

  // ----- FORECAST -----
  forecastSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  forecastCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  forecastRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  forecastDay: {
    width: 80,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  forecastIcon: {
    width: 40,
    height: 40,
  },
  forecastCondition: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 8,
  },
  forecastTemp: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },

  // ----- CUSTOM FORECAST ICONS -----
  customIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Clear Sun (orange/yellow circle)
  clearSun: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSunInner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFD60A',
  },

  // Night Moon
  nightMoon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F5F3CE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nightMoonInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E8E4C9',
  },

  // Mini Cloud
  miniCloud: {
    width: 30,
    height: 20,
    position: 'relative',
  },
  miniCloudPuff1: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#B0BEC5',
    left: 0,
    top: 4,
  },
  miniCloudPuff2: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#B0BEC5',
    left: 8,
    top: 0,
  },
  miniCloudPuff3: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#B0BEC5',
    right: 2,
    top: 6,
  },
  miniCloudBase: {
    position: 'absolute',
    width: 26,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#B0BEC5',
    bottom: 0,
    left: 2,
  },

  // Mini Rain Cloud
  miniRainCloud: {
    width: 26,
    height: 16,
    position: 'relative',
    marginTop: -4,
  },
  miniCloudPuff1Small: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#78909C',
    left: 0,
    top: 2,
  },
  miniCloudPuff2Small: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#78909C',
    left: 6,
    top: 0,
  },
  miniCloudBaseSmall: {
    position: 'absolute',
    width: 22,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#78909C',
    bottom: 0,
    left: 2,
  },
  miniRainDrops: {
    flexDirection: 'row',
    marginTop: 2,
    marginLeft: 4,
  },
  miniRainDrop: {
    width: 2,
    height: 8,
    backgroundColor: '#64B5F6',
    borderRadius: 1,
  },

  // Mini Snow
  miniSnowCloud: {
    width: 26,
    height: 16,
    position: 'relative',
    marginTop: -4,
  },
  miniSnowflakes: {
    flexDirection: 'row',
    marginTop: 1,
    marginLeft: 2,
  },
  miniSnowflake: {
    color: '#E3F2FD',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Mini Mist
  miniMist: {
    alignItems: 'center',
  },
  miniMistLine: {
    width: 28,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },

  // ----- WEATHER ANIMATIONS -----

  // Raindrop
  raindrop: {
    position: 'absolute',
    width: 2,
    height: 24,
    backgroundColor: 'rgba(170, 200, 255, 0.5)',
    borderRadius: 1,
  },

  // Lightning
  lightningBolt: {
    position: 'absolute',
    top: 0,
    width: 4,
    height: SCREEN_HEIGHT * 0.6,
    backgroundColor: '#fff',
    shadowColor: '#E0E7FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  lightningBolt1: {
    // Jagged lightning bolt shape using clip path effect (simulated with transform)
    transform: [
      { skewX: '-5deg' },
    ],
  },
  lightningBolt2: {
    transform: [
      { skewX: '5deg' },
    ],
  },
  lightningFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#E0E7FF',
  },

  // Rain Splash
  splash: {
    position: 'absolute',
    top: 0,
    width: 40,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  splashRing: {
    position: 'absolute',
    width: 30,
    height: 12,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(150, 200, 255, 0.8)',
    backgroundColor: 'transparent',
  },
  splashDrop: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 200, 255, 0.9)',
  },
  splashDroplet: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(150, 200, 255, 0.8)',
  },
  splashDropletSmall: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(150, 200, 255, 0.6)',
  },

  // Snow Pile (for stat cards)
  snowPileFlake: {
    position: 'absolute',
    top: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    zIndex: 10,
  },

  // Snowflake (background animation)
  snowflake: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },

  // Cloud
  cloud: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },

  // Sun Glow
  sunGlow: {
    position: 'absolute',
    top: -75,
    left: -75,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#FFE082',
    shadowColor: '#FFD54F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 80,
  },

  // Star
  star: {
    position: 'absolute',
    backgroundColor: '#fff',
  },

  // Moon
  moonContainer: {
    position: 'absolute',
    top: 100,
    right: 30,
    width: 70,
    height: 70,
  },
  moon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E8E4D4',
    overflow: 'hidden',
  },
  moonGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(232, 228, 212, 0.2)',
    top: -20,
    left: -20,
  },
  moonCrater1: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(180, 175, 160, 0.4)',
    top: 15,
    left: 20,
  },
  moonCrater2: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(180, 175, 160, 0.4)',
    top: 40,
    left: 40,
  },
  moonCrater3: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(180, 175, 160, 0.4)',
    top: 30,
    left: 12,
  },

  // ----- UV INDEX -----
  uvSection: {
    marginBottom: 24,
  },
  uvCard: {
    borderRadius: 16,
    padding: 20,
  },
  uvContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  uvValue: {
    fontSize: 48,
    fontWeight: '300',
  },
  uvLabel: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  uvBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  uvBarFill: {
    height: '100%',
    borderRadius: 4,
  },

  // ----- WEATHER ALERTS -----
  alertsSection: {
    marginBottom: 24,
  },
  alertCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B6B',
    flex: 1,
  },
  alertSender: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  alertDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },

  // ----- HOURLY FORECAST -----
  hourlySection: {
    marginBottom: 24,
  },
  hourlyScroll: {
    borderRadius: 16,
  },
  hourlyScrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  hourlyItem: {
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: 60,
  },
  hourlyTime: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  hourlyIcon: {
    width: 40,
    height: 40,
    marginVertical: 4,
  },
  hourlyTemp: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  hourlyPop: {
    fontSize: 11,
    color: '#64B5F6',
    marginTop: 4,
    fontWeight: '500',
  },

  // ----- MINUTELY PRECIPITATION -----
  minutelySection: {
    marginBottom: 24,
  },
  minutelyCard: {
    borderRadius: 16,
    padding: 16,
  },
  minutelyChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 60,
    gap: 1,
  },
  minutelyBar: {
    flex: 1,
    minHeight: 2,
    borderRadius: 1,
  },
  minutelyLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  minutelyLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
});
