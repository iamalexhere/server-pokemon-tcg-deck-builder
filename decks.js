// Sample deck data
module.exports = [
  {
    id: 1,
    userId: 0, // Corresponds to John Doe
    name: "John's Fire Deck",
    imageUrl: "",
    cards: [
      { id: "sm1-12", count: 2 },
      { id: "swsh1-25", count: 4 }
    ],
    favorite: true,
    lastModified: new Date().toISOString()
  },
  {
    id: 2,
    userId: 0,
    name: "John's Water Deck",
    imageUrl: "",
    cards: [
      { id: "sm2-31", count: 3 },
      { id: "swsh2-41", count: 2 }
    ],
    favorite: false,
    lastModified: new Date(Date.now() - 86400000).toISOString() // 1 day ago
  },
  {
    id: 3,
    userId: 1, // Corresponds to Jane Doe
    name: "Jane's Electric Deck",
    imageUrl: "",
    cards: [
      { id: "sm3-41", count: 2 },
      { id: "swsh3-51", count: 3 }
    ],
    favorite: true,
    lastModified: new Date().toISOString()
  }
];
