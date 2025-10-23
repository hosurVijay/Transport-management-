const calculateDistance = (lat1, long1, lat2, long2) => {
  const toRadians = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const diffLat = toRadians(lat2 - lat1);
  const diffLong = toRadians(long2 - long1);

  const intermediateValue =
    Math.sin(diffLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(diffLong / 2) ** 2;

  const centralAngel =
    2 *
    Math.atan2(Math.sqrt(intermediateValue), Math.sqrt(1 - intermediateValue));

  return earthRadius * centralAngel;
};

export { calculateDistance };
