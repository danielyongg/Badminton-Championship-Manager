import type { NamePool } from '../types';

// Potongan nama umum per budaya; dikombinasikan acak → nama atlet fiktif.
interface Pool { male: string[]; female: string[]; last: string[]; familyFirst?: boolean }

export const NAME_POOLS: Record<NamePool, Pool> = {
  id: {
    male: ['Adi', 'Bagas', 'Rizky', 'Dimas', 'Fajar', 'Galih', 'Hendra', 'Ilham', 'Yoga', 'Rangga', 'Tegar', 'Bayu', 'Arya', 'Raka'],
    female: ['Ayu', 'Dewi', 'Putri', 'Rani', 'Sari', 'Nadia', 'Intan', 'Fitri', 'Melati', 'Laras', 'Citra', 'Wulan', 'Tiara', 'Anisa'],
    last: ['Pratama', 'Saputra', 'Wijaya', 'Nugroho', 'Santoso', 'Kurniawan', 'Hidayat', 'Setiawan', 'Gunawan', 'Siregar', 'Halim', 'Lestari', 'Purnomo', 'Hakim'],
  },
  cn: {
    male: ['Wei', 'Hao', 'Jun', 'Lei', 'Yang', 'Tao', 'Kai', 'Bo', 'Chen', 'Jian', 'Rui', 'Zhen', 'Yu', 'Feng'],
    female: ['Mei', 'Xin', 'Yan', 'Ling', 'Jing', 'Hui', 'Qing', 'Yue', 'Fang', 'Na', 'Ying', 'Xia', 'Lan', 'Ting'],
    last: ['Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Lin', 'He', 'Guo'],
    familyFirst: true,
  },
  jp: {
    male: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito', 'Riku', 'Daiki', 'Shota', 'Takumi', 'Kenta', 'Hiroki', 'Yuma'],
    female: ['Yui', 'Aoi', 'Hina', 'Sakura', 'Mio', 'Rin', 'Nana', 'Akari', 'Misaki', 'Saki', 'Haruka', 'Ayaka'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Matsuda', 'Inoue', 'Kimura'],
  },
  kr: {
    male: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Hyun-woo', 'Jun-young', 'Dong-hyun', 'Sung-min', 'Tae-yang', 'Woo-jin', 'Jae-won'],
    female: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Su-bin', 'Ye-jin', 'Hye-won', 'Da-eun', 'So-yeon', 'Eun-ji'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin'],
    familyFirst: true,
  },
  th: {
    male: ['Somchai', 'Kittipong', 'Anan', 'Nattapong', 'Thanakorn', 'Chaiwat', 'Pongsak', 'Wichai', 'Sarawut', 'Phakin'],
    female: ['Ploy', 'Nicha', 'Kanya', 'Supanida', 'Pimchanok', 'Ratchanok', 'Siriporn', 'Benjawan', 'Malee', 'Arisa'],
    last: ['Srisuk', 'Chaiyaporn', 'Wongsakul', 'Kittisak', 'Rattanaporn', 'Boonmee', 'Thongchai', 'Saetang', 'Phanthong', 'Jaidee'],
  },
  my: {
    male: ['Aiman', 'Haziq', 'Irfan', 'Danial', 'Wei Jie', 'Kah Wai', 'Zulfadli', 'Hafiz', 'Jun Hao', 'Syahmi'],
    female: ['Nur Aina', 'Siti', 'Aisyah', 'Mei Xuan', 'Pei Ling', 'Farah', 'Nabila', 'Hui Min', 'Zara', 'Yi Ting'],
    last: ['Abdullah', 'Rahman', 'Ismail', 'Tan', 'Lim', 'Ong', 'Goh', 'Hamid', 'Yusof', 'Chong', 'Ng', 'Razak'],
  },
  in: {
    male: ['Arjun', 'Rohan', 'Vikram', 'Aditya', 'Karthik', 'Rahul', 'Siddharth', 'Aniket', 'Pranav', 'Varun', 'Kiran', 'Nikhil'],
    female: ['Ananya', 'Priya', 'Sneha', 'Kavya', 'Isha', 'Meera', 'Pooja', 'Divya', 'Riya', 'Aditi', 'Neha', 'Shruti'],
    last: ['Sharma', 'Reddy', 'Kumar', 'Nair', 'Singh', 'Rao', 'Patel', 'Iyer', 'Menon', 'Gupta', 'Das', 'Joshi'],
  },
  vn: {
    male: ['Minh', 'Duc', 'Hoang', 'Tuan', 'Quang', 'Long', 'Nam', 'Khoa', 'Huy', 'Phuc'],
    female: ['Linh', 'Thao', 'Huong', 'Trang', 'Mai', 'Ngoc', 'Lan', 'Anh', 'Vy', 'Hanh'],
    last: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo'],
    familyFirst: true,
  },
  nordic: {
    male: ['Mads', 'Rasmus', 'Mikkel', 'Anders', 'Magnus', 'Emil', 'Jonas', 'Kasper', 'Frederik', 'Oskar', 'Nikolaj', 'Lars'],
    female: ['Freja', 'Ida', 'Emma', 'Sofie', 'Mette', 'Line', 'Maja', 'Astrid', 'Julie', 'Signe', 'Camilla', 'Karin'],
    last: ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Larsen', 'Christensen', 'Lund', 'Holm', 'Berg', 'Dahl', 'Krogh'],
  },
  en: {
    male: ['James', 'Oliver', 'Jack', 'Harry', 'Ethan', 'Liam', 'Noah', 'Ben', 'Sam', 'Ryan', 'Callum', 'Daniel'],
    female: ['Emily', 'Grace', 'Chloe', 'Lucy', 'Sophie', 'Hannah', 'Ella', 'Amy', 'Megan', 'Olivia', 'Kate', 'Laura'],
    last: ['Smith', 'Taylor', 'Brown', 'Walker', 'Wright', 'Hughes', 'Clarke', 'Morgan', 'Bennett', 'Cooper', 'Reid', 'Murray'],
  },
  fr: {
    male: ['Lucas', 'Hugo', 'Louis', 'Théo', 'Mathis', 'Arthur', 'Jules', 'Maxime', 'Antoine', 'Yanis', 'Karim', 'Bastien'],
    female: ['Léa', 'Chloé', 'Manon', 'Camille', 'Inès', 'Sarah', 'Julie', 'Lina', 'Elise', 'Margaux', 'Amira', 'Clara'],
    last: ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Lefèvre', 'Girard', 'Roux', 'Fontaine', 'Mercier', 'Benali', 'Garnier'],
  },
  de: {
    male: ['Lukas', 'Leon', 'Finn', 'Jonas', 'Felix', 'Paul', 'Max', 'Niklas', 'Tim', 'Jan', 'Sven', 'Moritz'],
    female: ['Anna', 'Lena', 'Laura', 'Lisa', 'Mia', 'Hannah', 'Lea', 'Jana', 'Sophie', 'Nina', 'Eva', 'Marie'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'de Vries', 'Bakker', 'Keller', 'Huber'],
  },
  es: {
    male: ['Pablo', 'Diego', 'Javier', 'Carlos', 'Mateo', 'Andrés', 'Luis', 'Marco', 'Rafael', 'Tomás', 'Gabriel', 'João'],
    female: ['Lucía', 'Sofía', 'María', 'Paula', 'Carla', 'Valeria', 'Elena', 'Ana', 'Giulia', 'Camila', 'Beatriz', 'Daniela'],
    last: ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Romero', 'Torres', 'Rossi', 'Silva', 'Costa', 'Morales', 'Rivera'],
  },
  generic: {
    male: ['Adam', 'Omar', 'Ivan', 'Peter', 'Ali', 'David', 'Mark', 'Tomas', 'Yusuf', 'Emeka', 'Andrei', 'Joel'],
    female: ['Maria', 'Elena', 'Fatima', 'Anna', 'Leila', 'Nadia', 'Ada', 'Irina', 'Joy', 'Zeynep', 'Petra', 'Aylin'],
    last: ['Novak', 'Petrov', 'Kowalski', 'Hassan', 'Okafor', 'Ivanov', 'Horvat', 'Yilmaz', 'Mensah', 'Popescu', 'Santos', 'Ibrahim'],
  },
};
