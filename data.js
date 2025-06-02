// for obvious reasons, do not store password as plain text
module.exports = [
  {
    name: 'John Doe',
    username: 'jdoe42',
    password: '12345',
    profilePicture: '', // Base64 encoded image or URL
    pronouns: 'he/him',
    description: 'Pokemon TCG enthusiast and collector since 1999.',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString() // 30 days ago
  },
  {
    name: 'Jane Doe',
    username: 'janedoe',
    password: '919191',
    profilePicture: '',
    pronouns: 'she/her',
    description: 'Competitive Pokemon TCG player with a focus on Electric-type decks.',
    createdAt: new Date(Date.now() - 15 * 86400000).toISOString() // 15 days ago
  },
]
