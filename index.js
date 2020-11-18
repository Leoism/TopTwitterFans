const Twitter = require('twitter-lite');
const fs = require('fs');
const { createCanvas, loadImage } = require("canvas");
const positions = [
  [332, 135], [443, 135],
  [292, 240], [388, 270], [483, 240],
  [252, 345], [385, 375], [541, 345],
  [212, 460], [302, 480], [392, 500], [482, 480], [592, 460],
  [151, 575], [251, 615], [341, 645], [431, 645], [521, 615], [611, 575],
  [111, 722], [252, 773], [403, 802], [554, 773], [665, 722]
];

let TwitterClient;

/**
 * Creates an image with the users that mentioned the username the most.
 * @param {string} username  - twitter username
 */
async function main(username) {
  username = username[0] === '@' ? username.substring(1) : username;

  const client = new Twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET
  });

  const bearer = await client.getBearerToken();
  TwitterClient = new Twitter({
    bearer_token: bearer.access_token,
  });

  const user = await getUser(username);
  const topMentions = await getTopMentions(username);

  createImage(user, topMentions);
}

/**
 * Gets a direct link to the users profile image.
 * @param {string} username - twitter username 
 */
async function getUser(username) {
  let params = {
    screen_name: username,
    include_entities: false,
  };

  const res = (await TwitterClient.get('users/lookup', params))[0];
  return {
    avatar: res.profile_image_url_https.replace('_normal', '_400x400')
  };
}

/**
 * Collects up to the last 500 mentions to a user. Returns a sorted Map of users. 
 * @param {string} username - twitter username 
 * @return {Map} - a sorted Map with the first entry being the user with the
 *                 the most mentions of the username provided.
 */
async function getTopMentions(username) {
  const firstMentions = await getMentionsPage(username);
  const restOfMentions = await getAllMentions(username, firstMentions, 5);

  const mentions = [...firstMentions, ...restOfMentions];

  const totalMentions = new Map();
  for (const mention of mentions) {
    const user = mention.user.screen_name;
    if (totalMentions.has(user)) {
      totalMentions.set(user, [totalMentions.get(user)[0] + 1, totalMentions.get(user)[1]]);
    } else {
      totalMentions.set(user, [1, mention.user.profile_image_url_https.replace('_normal', '_400x400')]);
    }
  }

  const sortedTopMentions = new Map([...totalMentions.entries()].sort(sortMentions));
  return sortedTopMentions;
}

/**
 * Gathers up to n pages of mentions and return an array with all mentions.
 * @param {string} username - twitter username 
 * @param {Array} prevMentions - the previous collection of mentions
 * @param {Number} pages - the number of pages to iterate through of mentions
 */
async function getAllMentions(username, prevMentions, pages) {
  const total = [];
  let curr = 1;
  while (prevMentions[prevMentions.length - 1] !== undefined && curr < pages) {
    const lastId = prevMentions[prevMentions.length - 1].id;
    const mentions = await getMentionsPage(username, lastId);
    total.push(...mentions);
    curr++;
  }

  return total;
}

/**
 * Gets up to 100 mentions of a user up to max_id, if provided.
 * @param {string} username - twitter username
 * @param {Number} max_id - the maximum id to search through
 */
async function getMentionsPage(username, max_id) {
  const mentions = await TwitterClient.get('search/tweets', {
    count: 100,
    q: `to:${username} -filter:retweets -from:${username}`,
    result_type: 'recent',
    ...(!!max_id && { max_id }),
  });

  return mentions.statuses;
}

/**
 * Generates an image of all users inside of userMap.
 * @param {Object} main - user object with avatar property
 * @param {Map} userMap - a Map containing user profile images.
 */
async function createImage(main, userMap) {
  const width = 745;
  const height = 993;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = await loadImage(__dirname + '/background.jpg');
  ctx.drawImage(bg, 0, 0);

  const mainProfileImage = await loadImage(main.avatar);
  ctx.drawImage(mainProfileImage,
    0, 0, /** clip nothing */
    mainProfileImage.width, mainProfileImage.height, /** original size */
    385, 42, /** position */
    80, 80 /** resize */
  );

  const allUsers = [...userMap.entries()];
  for (let i = 0; i < positions.length; i++) {
    if (allUsers[i] === undefined) break;
    const profileImage = await loadImage(allUsers[i][1][1]);
    ctx.drawImage(profileImage,
      0, 0, /** clip nothing */
      profileImage.width, profileImage.height, /** original size */
      positions[i][0], positions[i][1], /** position */
      80, 80 /** resize */
    );
  }
  const out = fs.createWriteStream('./top_fans.png');
  const stream = canvas.createPNGStream();
  stream.pipe(out);
}

function sortMentions(a, b) {
  if (b[1][0] > a[1][0]) return 1;
  if (b[1][0] < a[1][0]) return -1;
  return 0;
}
