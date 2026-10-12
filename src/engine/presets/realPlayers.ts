import { ATTRS, type Attrs, type Pair, type Player } from '../types';

// Atlet asli bawaan (paket BWF 2026 / 2027+). Negara yang atletnya kurang dilengkapi atlet fiktif oleh generator.
// ASUMSI: daftar, pasangan & tahun lahir per pengetahuan s/d 2025, sebagian tahun lahir perkiraan.
// "Level" = perkiraan kemampuan (CA) dari ranking & prestasi; bukan data resmi. Koreksi lewat Editor.
// Belum ada junior asli: junior (≤17 th) seluruhnya fiktif.

type Row = [name: string, gender: 'M' | 'F', born: number, focus: 'S' | 'D', level: number, hand?: 'L'];
type PairRow = [Pair['discipline'], string, string];

const REAL: Record<string, { p: Row[]; d?: PairRow[] }> = {
  CHN: {
    p: [
      ['Shi Yu Qi', 'M', 1996, 'S', 92], ['Li Shi Feng', 'M', 2000, 'S', 88], ['Weng Hong Yang', 'M', 1999, 'S', 82, 'L'],
      ['Lu Guang Zu', 'M', 1996, 'S', 80], ['Wang Zheng Xing', 'M', 2000, 'S', 78], ['Hu Zhe An', 'M', 2002, 'S', 77],
      ['Wang Zhi Yi', 'F', 2000, 'S', 90], ['Chen Yu Fei', 'F', 1998, 'S', 89], ['Han Yue', 'F', 1999, 'S', 86],
      ['Gao Fang Jie', 'F', 1998, 'S', 82], ['Zhang Yi Man', 'F', 1997, 'S', 80],
      ['Liang Wei Keng', 'M', 2001, 'D', 87], ['Wang Chang', 'M', 2001, 'D', 87], ['He Ji Ting', 'M', 1998, 'D', 83],
      ['Ren Xiang Yu', 'M', 1998, 'D', 83], ['Chen Bo Yang', 'M', 2001, 'D', 81], ['Liu Yi', 'M', 2001, 'D', 81],
      ['Feng Yan Zhe', 'M', 1998, 'D', 86], ['Jiang Zhen Bang', 'M', 2001, 'D', 87], ['Guo Xin Wa', 'M', 2002, 'D', 80],
      ['Liu Sheng Shu', 'F', 2004, 'D', 88], ['Tan Ning', 'F', 2003, 'D', 88], ['Chen Qing Chen', 'F', 1997, 'D', 86],
      ['Jia Yi Fan', 'F', 1997, 'D', 86], ['Zhang Shu Xian', 'F', 1999, 'D', 83], ['Zheng Yu', 'F', 1996, 'D', 83],
      ['Li Yi Jing', 'F', 2001, 'D', 80], ['Luo Xu Min', 'F', 2002, 'D', 80], ['Huang Dong Ping', 'F', 1995, 'D', 86],
      ['Wei Ya Xin', 'F', 2000, 'D', 87], ['Chen Fang Hui', 'F', 2002, 'D', 80],
    ],
    d: [
      ['MD', 'Liang Wei Keng', 'Wang Chang'], ['MD', 'He Ji Ting', 'Ren Xiang Yu'], ['MD', 'Chen Bo Yang', 'Liu Yi'],
      ['WD', 'Liu Sheng Shu', 'Tan Ning'], ['WD', 'Chen Qing Chen', 'Jia Yi Fan'], ['WD', 'Zhang Shu Xian', 'Zheng Yu'], ['WD', 'Li Yi Jing', 'Luo Xu Min'],
      ['XD', 'Feng Yan Zhe', 'Huang Dong Ping'], ['XD', 'Jiang Zhen Bang', 'Wei Ya Xin'], ['XD', 'Guo Xin Wa', 'Chen Fang Hui'],
    ],
  },
  INA: {
    p: [
      ['Jonatan Christie', 'M', 1997, 'S', 86], ['Anthony Sinisuka Ginting', 'M', 1996, 'S', 84], ['Alwi Farhan', 'M', 2005, 'S', 80],
      ['Chico Aura Dwi Wardoyo', 'M', 1998, 'S', 78], ['Moh Zaki Ubaidillah', 'M', 2006, 'S', 75],
      ['Gregoria Mariska Tunjung', 'F', 1999, 'S', 86], ['Putri Kusuma Wardani', 'F', 2002, 'S', 82],
      ['Ester Nurumi Tri Wardoyo', 'F', 2005, 'S', 78], ['Komang Ayu Cahya Dewi', 'F', 2002, 'S', 75],
      ['Fajar Alfian', 'M', 1995, 'D', 84], ['Muhammad Rian Ardianto', 'M', 1996, 'D', 84],
      ['Sabar Karyaman Gutama', 'M', 1997, 'D', 83], ['Muhammad Reza Pahlevi Isfahani', 'M', 2000, 'D', 83],
      ['Leo Rolly Carnando', 'M', 2001, 'D', 81], ['Daniel Marthin', 'M', 2001, 'D', 81],
      ['Muhammad Shohibul Fikri', 'M', 2000, 'D', 81], ['Bagas Maulana', 'M', 1998, 'D', 81],
      ['Dejan Ferdinansyah', 'M', 1999, 'D', 81], ['Rinov Rivaldy', 'M', 1999, 'D', 80], ['Rehan Naufal Kusharjanto', 'M', 2000, 'D', 80],
      ['Jafar Hidayatullah', 'M', 2003, 'D', 78],
      ['Apriyani Rahayu', 'F', 1998, 'D', 84], ['Siti Fadia Silva Ramadhanti', 'F', 2000, 'D', 84],
      ['Febriana Dwipuji Kusuma', 'F', 2001, 'D', 82], ['Amallia Cahaya Pratiwi', 'F', 2001, 'D', 82],
      ['Lanny Tria Mayasari', 'F', 2002, 'D', 80], ['Ribka Sugiarto', 'F', 1999, 'D', 80],
      ['Gloria Emanuelle Widjaja', 'F', 1993, 'D', 81], ['Pitha Haningtyas Mentari', 'F', 1999, 'D', 80],
      ['Lisa Ayu Kusumawati', 'F', 2000, 'D', 80], ['Aisyah Salsabila Putri Pranata', 'F', 2003, 'D', 78],
    ],
    d: [
      ['MD', 'Fajar Alfian', 'Muhammad Rian Ardianto'], ['MD', 'Sabar Karyaman Gutama', 'Muhammad Reza Pahlevi Isfahani'],
      ['MD', 'Leo Rolly Carnando', 'Daniel Marthin'], ['MD', 'Muhammad Shohibul Fikri', 'Bagas Maulana'],
      ['WD', 'Apriyani Rahayu', 'Siti Fadia Silva Ramadhanti'], ['WD', 'Febriana Dwipuji Kusuma', 'Amallia Cahaya Pratiwi'],
      ['WD', 'Lanny Tria Mayasari', 'Ribka Sugiarto'],
      ['XD', 'Dejan Ferdinansyah', 'Gloria Emanuelle Widjaja'], ['XD', 'Rinov Rivaldy', 'Pitha Haningtyas Mentari'],
      ['XD', 'Rehan Naufal Kusharjanto', 'Lisa Ayu Kusumawati'], ['XD', 'Jafar Hidayatullah', 'Aisyah Salsabila Putri Pranata'],
    ],
  },
  JPN: {
    p: [
      ['Kodai Naraoka', 'M', 2001, 'S', 86], ['Kenta Nishimoto', 'M', 1994, 'S', 83], ['Koki Watanabe', 'M', 1999, 'S', 80],
      ['Kanta Tsuneyama', 'M', 1996, 'S', 79], ['Yushi Tanaka', 'M', 1999, 'S', 78],
      ['Akane Yamaguchi', 'F', 1997, 'S', 89], ['Tomoka Miyazaki', 'F', 2006, 'S', 83], ['Aya Ohori', 'F', 1996, 'S', 80],
      ['Nozomi Okuhara', 'F', 1995, 'S', 79], ['Natsuki Nidaira', 'F', 1998, 'S', 77],
      ['Takuro Hoki', 'M', 1995, 'D', 84], ['Yugo Kobayashi', 'M', 1995, 'D', 84], ['Hiroki Midorikawa', 'M', 1997, 'D', 81],
      ['Kyohei Yamashita', 'M', 1998, 'D', 81], ['Takumi Nomura', 'M', 2001, 'D', 78], ['Yuichi Shimogami', 'M', 2000, 'D', 79],
      ['Yuta Watanabe', 'M', 1997, 'D', 84, 'L'],
      ['Nami Matsuyama', 'F', 1998, 'D', 87], ['Chiharu Shida', 'F', 1997, 'D', 87], ['Mayu Matsumoto', 'F', 1995, 'D', 83],
      ['Wakana Nagahara', 'F', 1996, 'D', 83], ['Rin Iwanaga', 'F', 1997, 'D', 83], ['Kie Nakanishi', 'F', 1998, 'D', 83],
      ['Arisa Igarashi', 'F', 1996, 'D', 81], ['Ayako Sakuramoto', 'F', 1995, 'D', 81], ['Maya Taguchi', 'F', 2002, 'D', 80],
      ['Natsu Saito', 'F', 2000, 'D', 79], ['Sayaka Hobara', 'F', 2001, 'D', 78],
    ],
    d: [
      ['MD', 'Takuro Hoki', 'Yugo Kobayashi'], ['MD', 'Hiroki Midorikawa', 'Kyohei Yamashita'], ['MD', 'Takumi Nomura', 'Yuichi Shimogami'],
      ['WD', 'Nami Matsuyama', 'Chiharu Shida'], ['WD', 'Mayu Matsumoto', 'Wakana Nagahara'], ['WD', 'Rin Iwanaga', 'Kie Nakanishi'],
      ['WD', 'Arisa Igarashi', 'Ayako Sakuramoto'],
      ['XD', 'Yuta Watanabe', 'Maya Taguchi'], ['XD', 'Hiroki Midorikawa', 'Natsu Saito'], ['XD', 'Yuichi Shimogami', 'Sayaka Hobara'],
    ],
  },
  KOR: {
    p: [
      ['Jeon Hyeok Jin', 'M', 1995, 'S', 77], ['Cho Geon Yeop', 'M', 1999, 'S', 75],
      ['An Se Young', 'F', 2002, 'S', 95], ['Kim Ga Eun', 'F', 1998, 'S', 82], ['Sim Yu Jin', 'F', 1999, 'S', 80],
      ['Kim Won Ho', 'M', 1999, 'D', 88], ['Seo Seung Jae', 'M', 1997, 'D', 88], ['Kang Min Hyuk', 'M', 1999, 'D', 81],
      ['Ki Dong Ju', 'M', 2001, 'D', 81], ['Jin Yong', 'M', 2003, 'D', 79], ['Na Sung Seung', 'M', 1999, 'D', 79],
      ['Baek Ha Na', 'F', 2000, 'D', 86], ['Lee So Hee', 'F', 1994, 'D', 86], ['Kim So Yeong', 'F', 1992, 'D', 84],
      ['Kong Hee Yong', 'F', 1996, 'D', 84], ['Jeong Na Eun', 'F', 2000, 'D', 82], ['Kim Hye Jeong', 'F', 1998, 'D', 82],
      ['Chae Yu Jung', 'F', 1995, 'D', 83],
    ],
    d: [
      ['MD', 'Kim Won Ho', 'Seo Seung Jae'], ['MD', 'Kang Min Hyuk', 'Ki Dong Ju'], ['MD', 'Jin Yong', 'Na Sung Seung'],
      ['WD', 'Baek Ha Na', 'Lee So Hee'], ['WD', 'Kim So Yeong', 'Kong Hee Yong'], ['WD', 'Jeong Na Eun', 'Kim Hye Jeong'],
      ['XD', 'Seo Seung Jae', 'Chae Yu Jung'], ['XD', 'Kim Won Ho', 'Jeong Na Eun'],
    ],
  },
  MAS: {
    p: [
      ['Lee Zii Jia', 'M', 1998, 'S', 85], ['Ng Tze Yong', 'M', 2000, 'S', 79], ['Leong Jun Hao', 'M', 1999, 'S', 78], ['Justin Hoh', 'M', 2004, 'S', 75],
      ['Goh Jin Wei', 'F', 2000, 'S', 76], ['Letshanaa Karupathevan', 'F', 2003, 'S', 71], ['Wong Ling Ching', 'F', 2001, 'S', 70],
      ['Aaron Chia', 'M', 1997, 'D', 88], ['Soh Wooi Yik', 'M', 1998, 'D', 88], ['Goh Sze Fei', 'M', 1997, 'D', 87],
      ['Nur Izzuddin', 'M', 1997, 'D', 87], ['Man Wei Chong', 'M', 1999, 'D', 85], ['Tee Kai Wun', 'M', 2000, 'D', 85],
      ['Chen Tang Jie', 'M', 1998, 'D', 85], ['Goh Soon Huat', 'M', 1990, 'D', 82], ['Hoo Pang Ron', 'M', 2001, 'D', 77],
      ['Pearly Tan', 'F', 2000, 'D', 87], ['Thinaah Muralitharan', 'F', 1998, 'D', 87], ['Toh Ee Wei', 'F', 2000, 'D', 85],
      ['Shevon Jemie Lai', 'F', 1993, 'D', 82], ['Go Pei Kee', 'F', 2002, 'D', 75], ['Teoh Mei Xing', 'F', 2002, 'D', 75],
      ['Cheng Su Yin', 'F', 2002, 'D', 76],
    ],
    d: [
      ['MD', 'Aaron Chia', 'Soh Wooi Yik'], ['MD', 'Goh Sze Fei', 'Nur Izzuddin'], ['MD', 'Man Wei Chong', 'Tee Kai Wun'],
      ['WD', 'Pearly Tan', 'Thinaah Muralitharan'], ['WD', 'Go Pei Kee', 'Teoh Mei Xing'],
      ['XD', 'Chen Tang Jie', 'Toh Ee Wei'], ['XD', 'Goh Soon Huat', 'Shevon Jemie Lai'], ['XD', 'Hoo Pang Ron', 'Cheng Su Yin'],
    ],
  },
  TPE: {
    p: [
      ['Lin Chun Yi', 'M', 1999, 'S', 84, 'L'], ['Chou Tien Chen', 'M', 1990, 'S', 82], ['Chi Yu Jen', 'M', 2000, 'S', 76], ['Su Li Yang', 'M', 1998, 'S', 75],
      ['Chiu Pin Chian', 'F', 2002, 'S', 77], ['Hsu Wen Chi', 'F', 1997, 'S', 77], ['Sung Shuo Yun', 'F', 2002, 'S', 76], ['Lin Hsiang Ti', 'F', 1999, 'S', 75],
      ['Lu Ching Yao', 'M', 1993, 'D', 81], ['Yang Po Han', 'M', 1994, 'D', 81], ['Lee Jhe Huei', 'M', 1994, 'D', 79],
      ['Yang Po Hsuan', 'M', 1996, 'D', 79], ['Lee Fang Chih', 'M', 1998, 'D', 78], ['Lee Fang Jen', 'M', 1998, 'D', 78],
      ['Ye Hong Wei', 'M', 1998, 'D', 83],
      ['Hsieh Pei Shan', 'F', 2000, 'D', 78], ['Hung En Tzu', 'F', 2000, 'D', 78], ['Hsu Ya Ching', 'F', 1991, 'D', 77],
      ['Lin Wan Ching', 'F', 1993, 'D', 77], ['Lee Chia Hsin', 'F', 1997, 'D', 83], ['Hu Ling Fang', 'F', 1997, 'D', 78],
    ],
    d: [
      ['MD', 'Lu Ching Yao', 'Yang Po Han'], ['MD', 'Lee Jhe Huei', 'Yang Po Hsuan'], ['MD', 'Lee Fang Chih', 'Lee Fang Jen'],
      ['WD', 'Hsieh Pei Shan', 'Hung En Tzu'], ['WD', 'Hsu Ya Ching', 'Lin Wan Ching'],
      ['XD', 'Ye Hong Wei', 'Lee Chia Hsin'], ['XD', 'Yang Po Hsuan', 'Hu Ling Fang'],
    ],
  },
  THA: {
    p: [
      ['Kunlavut Vitidsarn', 'M', 2001, 'S', 89], ['Kantaphon Wangcharoen', 'M', 1998, 'S', 79], ['Panitchaphon Teeraratsakul', 'M', 2001, 'S', 74],
      ['Ratchanok Intanon', 'F', 1995, 'S', 84], ['Supanida Katethong', 'F', 1997, 'S', 83, 'L'], ['Pornpawee Chochuwong', 'F', 1998, 'S', 82],
      ['Busanan Ongbamrungphan', 'F', 1996, 'S', 80], ['Pitchamon Opatniput', 'F', 2003, 'S', 76],
      ['Dechapol Puavaranukroh', 'M', 1997, 'D', 84], ['Kittinupong Kedren', 'M', 1996, 'D', 79], ['Supak Jomkoh', 'M', 1996, 'D', 79],
      ['Peeratchai Sukphun', 'M', 2000, 'D', 78], ['Pakkapon Teeraratsakul', 'M', 2000, 'D', 78], ['Ruttanapak Oupthong', 'M', 2001, 'D', 79],
      ['Supissara Paewsampran', 'F', 2001, 'D', 84], ['Jongkolphan Kititharakul', 'F', 1993, 'D', 81], ['Rawinda Prajongjai', 'F', 1993, 'D', 81],
      ['Benyapa Aimsaard', 'F', 2002, 'D', 83], ['Nuntakarn Aimsaard', 'F', 2000, 'D', 83], ['Jhenicha Sudjaipraparat', 'F', 2001, 'D', 79],
    ],
    d: [
      ['MD', 'Kittinupong Kedren', 'Supak Jomkoh'], ['MD', 'Peeratchai Sukphun', 'Pakkapon Teeraratsakul'],
      ['WD', 'Benyapa Aimsaard', 'Nuntakarn Aimsaard'], ['WD', 'Jongkolphan Kititharakul', 'Rawinda Prajongjai'],
      ['XD', 'Dechapol Puavaranukroh', 'Supissara Paewsampran'], ['XD', 'Ruttanapak Oupthong', 'Jhenicha Sudjaipraparat'],
    ],
  },
  IND: {
    p: [
      ['Lakshya Sen', 'M', 2001, 'S', 84], ['HS Prannoy', 'M', 1992, 'S', 80], ['Ayush Shetty', 'M', 2005, 'S', 77],
      ['Priyanshu Rajawat', 'M', 2002, 'S', 77], ['Kidambi Srikanth', 'M', 1993, 'S', 77], ['Kiran George', 'M', 2000, 'S', 76],
      ['PV Sindhu', 'F', 1995, 'S', 82], ['Malvika Bansod', 'F', 2001, 'S', 75], ['Unnati Hooda', 'F', 2007, 'S', 75],
      ['Anupama Upadhyaya', 'F', 2005, 'S', 74], ['Aakarshi Kashyap', 'F', 2001, 'S', 72],
      ['Satwiksairaj Rankireddy', 'M', 2000, 'D', 89], ['Chirag Shetty', 'M', 1997, 'D', 89], ['Arjun MR', 'M', 1997, 'D', 77],
      ['Dhruv Kapila', 'M', 2000, 'D', 78], ['Rohan Kapoor', 'M', 1997, 'D', 75],
      ['Treesa Jolly', 'F', 2003, 'D', 82], ['Gayatri Gopichand', 'F', 2003, 'D', 82], ['Ashwini Ponnappa', 'F', 1989, 'D', 77],
      ['Tanisha Crasto', 'F', 2003, 'D', 78], ['Ruthvika Gadde', 'F', 1997, 'D', 74],
    ],
    d: [
      ['MD', 'Satwiksairaj Rankireddy', 'Chirag Shetty'], ['MD', 'Arjun MR', 'Dhruv Kapila'],
      ['WD', 'Treesa Jolly', 'Gayatri Gopichand'], ['WD', 'Ashwini Ponnappa', 'Tanisha Crasto'],
      ['XD', 'Dhruv Kapila', 'Tanisha Crasto'], ['XD', 'Rohan Kapoor', 'Ruthvika Gadde'],
    ],
  },
  HKG: {
    p: [
      ['Lee Cheuk Yiu', 'M', 1996, 'S', 79], ['Ng Ka Long Angus', 'M', 1994, 'S', 78], ['Jason Gunawan', 'M', 2000, 'S', 73],
      ['Lo Sin Yan Happy', 'F', 1999, 'S', 72],
      ['Tang Chun Man', 'M', 1995, 'D', 83], ['Tse Ying Suet', 'F', 1991, 'D', 83],
      ['Yeung Nga Ting', 'F', 1999, 'D', 75], ['Yeung Pui Lam', 'F', 2000, 'D', 75],
    ],
    d: [['XD', 'Tang Chun Man', 'Tse Ying Suet'], ['WD', 'Yeung Nga Ting', 'Yeung Pui Lam']],
  },
  SGP: {
    p: [
      ['Loh Kean Yew', 'M', 1997, 'S', 83], ['Jason Teh', 'M', 2000, 'S', 75], ['Yeo Jia Min', 'F', 1999, 'S', 81],
      ['Terry Hee', 'M', 1995, 'D', 76], ['Loh Kean Hean', 'M', 1995, 'D', 74], ['Jessica Tan', 'F', 1993, 'D', 76],
    ],
    d: [['MD', 'Terry Hee', 'Loh Kean Hean'], ['XD', 'Terry Hee', 'Jessica Tan']],
  },
  VIE: { p: [['Nguyen Hai Dang', 'M', 2000, 'S', 72], ['Le Duc Phat', 'M', 2002, 'S', 70], ['Nguyen Thuy Linh', 'F', 1997, 'S', 80]] },
  DEN: {
    p: [
      ['Anders Antonsen', 'M', 1997, 'S', 89], ['Viktor Axelsen', 'M', 1994, 'S', 88], ['Rasmus Gemke', 'M', 1997, 'S', 79],
      ['Magnus Johannesen', 'M', 1997, 'S', 76],
      ['Mia Blichfeldt', 'F', 1997, 'S', 82], ['Line Christophersen', 'F', 2000, 'S', 78], ['Julie Dawall Jakobsen', 'F', 1998, 'S', 75],
      ['Kim Astrup', 'M', 1992, 'D', 84], ['Anders Skaarup Rasmussen', 'M', 1989, 'D', 84], ['Daniel Lundgaard', 'M', 2000, 'D', 79],
      ['Mads Vestergaard', 'M', 1999, 'D', 79], ['Rasmus Kjaer', 'M', 1998, 'D', 78], ['Frederik Sogaard', 'M', 1997, 'D', 78],
      ['Mathias Christiansen', 'M', 1994, 'D', 79], ['Jesper Toft', 'M', 1998, 'D', 78],
      ['Maiken Fruergaard', 'F', 1995, 'D', 77], ['Sara Thygesen', 'F', 1991, 'D', 77], ['Alexandra Boje', 'F', 1999, 'D', 79],
      ['Amalie Magelund', 'F', 1998, 'D', 78], ['Christine Busch', 'F', 2000, 'D', 76],
    ],
    d: [
      ['MD', 'Kim Astrup', 'Anders Skaarup Rasmussen'], ['MD', 'Daniel Lundgaard', 'Mads Vestergaard'], ['MD', 'Rasmus Kjaer', 'Frederik Sogaard'],
      ['WD', 'Maiken Fruergaard', 'Sara Thygesen'],
      ['XD', 'Mathias Christiansen', 'Alexandra Boje'], ['XD', 'Jesper Toft', 'Amalie Magelund'], ['XD', 'Mads Vestergaard', 'Christine Busch'],
    ],
  },
  FRA: {
    p: [
      ['Alex Lanier', 'M', 2005, 'S', 85], ['Christo Popov', 'M', 2002, 'S', 83], ['Toma Junior Popov', 'M', 1998, 'S', 82],
      ['Arnaud Merkle', 'M', 2000, 'S', 75], ['Leonice Huet', 'F', 2000, 'S', 72],
      ['Thom Gicquel', 'M', 1999, 'D', 83], ['Delphine Delrue', 'F', 1998, 'D', 83],
      ['Margot Lambert', 'F', 1999, 'D', 74], ['Camille Pognante', 'F', 2001, 'D', 74],
    ],
    d: [['MD', 'Christo Popov', 'Toma Junior Popov'], ['XD', 'Thom Gicquel', 'Delphine Delrue'], ['WD', 'Margot Lambert', 'Camille Pognante']],
  },
  ENG: {
    p: [
      ['Toby Penty', 'M', 1992, 'S', 74], ['Harry Huang', 'M', 2000, 'S', 72],
      ['Ben Lane', 'M', 1997, 'D', 80], ['Sean Vendy', 'M', 1996, 'D', 80], ['Callum Hemming', 'M', 1999, 'D', 76],
      ['Estelle van Leeuwen', 'F', 2001, 'D', 76],
    ],
    d: [['MD', 'Ben Lane', 'Sean Vendy'], ['XD', 'Callum Hemming', 'Estelle van Leeuwen']],
  },
  GER: {
    p: [
      ['Fabian Roth', 'M', 1995, 'S', 74], ['Yvonne Li', 'F', 1998, 'S', 76],
      ['Mark Lamsfuss', 'M', 1994, 'D', 79], ['Marvin Seidel', 'M', 1995, 'D', 78], ['Isabel Lohau', 'F', 1992, 'D', 79],
    ],
    d: [['MD', 'Mark Lamsfuss', 'Marvin Seidel'], ['XD', 'Mark Lamsfuss', 'Isabel Lohau']],
  },
  ESP: { p: [['Carolina Marin', 'F', 1993, 'S', 84, 'L'], ['Clara Azurmendi', 'F', 1998, 'S', 75], ['Pablo Abian', 'M', 1985, 'S', 70]] },
  NED: { p: [['Robin Tabeling', 'M', 1994, 'D', 80], ['Selena Piek', 'F', 1991, 'D', 80]], d: [['XD', 'Robin Tabeling', 'Selena Piek']] },
  SCO: {
    p: [
      ['Kieran Merrilees', 'M', 1996, 'S', 71], ['Kirsty Gilmour', 'F', 1993, 'S', 75],
      ['Alexander Dunn', 'M', 1998, 'D', 75], ['Adam Hall', 'M', 1996, 'D', 75], ['Julie MacPherson', 'F', 1997, 'D', 73],
    ],
    d: [['MD', 'Alexander Dunn', 'Adam Hall'], ['XD', 'Adam Hall', 'Julie MacPherson']],
  },
  IRL: { p: [['Nhat Nguyen', 'M', 2000, 'S', 77], ['Rachael Darragh', 'F', 1997, 'S', 71]] },
  FIN: { p: [['Kalle Koljonen', 'M', 1994, 'S', 71]] },
  SUI: { p: [['Jenjira Stadelmann', 'F', 1999, 'S', 71]] },
  BUL: { p: [['Kaloyana Nalbantova', 'F', 2001, 'S', 71]] },
  CZE: { p: [['Jan Louda', 'M', 1999, 'S', 71], ['Tereza Svabikova', 'F', 1999, 'S', 69]] },
  UKR: { p: [['Polina Buhrova', 'F', 2001, 'S', 71], ['Danylo Bosniuk', 'M', 2000, 'S', 69]] },
  TUR: { p: [['Neslihan Arin', 'F', 1994, 'S', 71]] },
  CAN: {
    p: [
      ['Brian Yang', 'M', 2001, 'S', 79], ['Michelle Li', 'F', 1991, 'S', 77], ['Wen Yu Zhang', 'F', 2000, 'S', 73],
      ['Kevin Lee', 'M', 1998, 'D', 73], ['Ty Alexander Lindeman', 'M', 1998, 'D', 75],
      ['Catherine Choi', 'F', 1997, 'D', 77], ['Josephine Wu', 'F', 1995, 'D', 77],
    ],
    d: [['MD', 'Kevin Lee', 'Ty Alexander Lindeman'], ['WD', 'Catherine Choi', 'Josephine Wu'], ['XD', 'Ty Alexander Lindeman', 'Josephine Wu']],
  },
  USA: {
    p: [
      ['Beiwen Zhang', 'F', 1990, 'S', 77],
      ['Chen Zhi Yi', 'M', 1999, 'D', 74], ['Presley Smith', 'M', 2002, 'D', 74], ['Vinson Chiu', 'M', 1998, 'D', 74],
      ['Annie Xu', 'F', 2002, 'D', 75], ['Kerry Xu', 'F', 2002, 'D', 75], ['Jennie Gai', 'F', 2002, 'D', 74],
    ],
    d: [['MD', 'Chen Zhi Yi', 'Presley Smith'], ['WD', 'Annie Xu', 'Kerry Xu'], ['XD', 'Vinson Chiu', 'Jennie Gai']],
  },
  GUA: { p: [['Kevin Cordon', 'M', 1986, 'S', 69]] },
  BRA: { p: [['Ygor Coelho', 'M', 1996, 'S', 71]] },
  EGY: { p: [['Adham Hatem Elgamal', 'M', 1998, 'D', 68], ['Doha Hany', 'F', 1997, 'D', 68]], d: [['XD', 'Adham Hatem Elgamal', 'Doha Hany']] },
  AUS: {
    p: [
      ['Kenneth Choo', 'M', 1997, 'D', 72], ['Gronya Somerville', 'F', 1995, 'D', 73],
      ['Setyana Mapasa', 'F', 1995, 'D', 75], ['Angela Yu', 'F', 1997, 'D', 75],
    ],
    d: [['WD', 'Setyana Mapasa', 'Angela Yu'], ['XD', 'Kenneth Choo', 'Gronya Somerville']],
  },
};

// Gaya bermain menurut fokus: tunggal lebih cepat & tahan lama, ganda lebih kuat smash/net/servis.
const SHAPE: Record<'S' | 'D', Partial<Attrs>> = {
  S: { speed: 4, stamina: 5, consistency: 3, deception: 2, smash: -2, net: -3, serve: -5, warmup: -2 },
  D: { smash: 4, net: 4, serve: 3, defense: 2, stamina: -4, consistency: -3, deception: -3, warmup: -2 },
};
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function toPlayer(countryId: string, [name, gender, born, focus, level, hand]: Row, startYear: number): Player {
  // Variasi kecil per atlet (tetap sama tiap New Game), lalu digeser agar rata-rata = level.
  const raw = ATTRS.map((a) => level + (SHAPE[focus][a] ?? 0) + (hash(name + a) % 7) - 3);
  const shift = level - raw.reduce((s, x) => s + x, 0) / raw.length;
  const attrs = Object.fromEntries(ATTRS.map((a, i) => [a, Math.max(1, Math.min(100, Math.round(raw[i] + shift)))])) as Attrs;
  const age = startYear - born;
  return {
    id: `${countryId}-r-${slug(name)}`, name, countryId, gender, hand: hand ?? 'R', birth: { year: born, week: 26 },
    attrs, pa: Math.min(99, level + Math.max(1, (24 - age) * 2)), form: 0, fatigue: 0,
    attrHistory: [{ year: startYear - 1, attrs: { ...attrs } }],
  };
}

/** Atlet & pasangan asli untuk paket bawaan. */
export function realRoster(startYear: number): { players: Player[]; pairs: Pair[] } {
  const players: Player[] = [];
  const pairs: Pair[] = [];
  for (const [cid, { p, d = [] }] of Object.entries(REAL)) {
    const own = p.map((r) => toPlayer(cid, r, startYear));
    const id = (name: string) => own.find((x) => x.name === name)!.id;
    players.push(...own);
    d.forEach(([discipline, a, b], i) => pairs.push({
      id: `${cid}-r-${discipline}${i + 1}`, discipline, playerIds: [id(a), id(b)],
      chemistry: 80, matchesTogether: 100, formed: { year: startYear - 2, week: 1 },
    }));
  }
  return { players, pairs };
}
