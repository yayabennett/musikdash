/** Minimal Next.js config for the music upload demo */
module.exports = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('sqlite3');
    }
    return config;
  },
};
