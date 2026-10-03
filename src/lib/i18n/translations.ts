import { SHELTER_PHONE_DISPLAY } from "@/lib/domain/shelterIdentity";
export type Language = "en" | "ms";

/** Every leaf of the dictionary as a dot path, e.g. `home.step1Title`. */
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<TranslationDictionary>;

export interface TranslationDictionary {
  nav: {
    adoptablePets: string;
    donate: string;
    trackApplication: string;
    bulletins: string;
    adoptOrFoster: string;
    volunteer: string;
    matchQuiz: string;
    sponsor: string;
    adopt: string;
    sanctuaryLocation: string;
    phone: string;
    visitingHours: string;
    browsePets: string;
    transparency: string;
    sponsorWall: string;
  };
  common: {
    freeAdoption: string;
    available: string;
    pending: string;
    adopted: string;
    inRehabilitation: string;
    rehabStage: string;
    rehabProgress: string;
    sponsorMe: string;
    dog: string;
    cat: string;
    other: string;
    dogs: string;
    cats: string;
    all: string;
    male: string;
    female: string;
    small: string;
    medium: string;
    large: string;
    puppyKitten: string;
    young: string;
    adult: string;
    senior: string;
    low: string;
    moderate: string;
    high: string;
    search: string;
    searchPlaceholder: string;
    filter: string;
    resetFilters: string;
    details: string;
    apply: string;
    sponsor: string;
    share: string;
    sharePet: string;
    linkCopied: string;
    back: string;
    backToAllPets: string;
    close: string;
    submit: string;
    submitting: string;
    loading: string;
    verified: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    browseBtn: string;
    quizBtn: string;
    sponsorBtn: string;
    visitingHoursLabel: string;
    visitingHoursText: string;
    locationText: string;
    tnrmHeadline: string;
  };
  home: {
    bulletinsTitle: string;
    bulletinsSubtitle: string;
    availableTitle: string;
    availableSubtitle: string;
    viewAllPets: string;
    galleryLoading: string;
    howItWorksTitle: string;
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    protocolsTitle: string;
    protocolsSubtitle: string;
    protocol1Title: string;
    protocol1Desc: string;
    protocol2Title: string;
    protocol2Desc: string;
    protocol3Title: string;
    protocol3Desc: string;
    protocol4Title: string;
    protocol4Desc: string;
  };
  pets: {
    title: string;
    subtitle: string;
    speciesFilter: string;
    genderFilter: string;
    ageFilter: string;
    sizeFilter: string;
    statusFilter: string;
    trackFilter: string;
    trackAdoptable: string;
    trackRehabilitation: string;
    trackAlumni: string;
    noResultsTitle: string;
    noResultsDesc: string;
    showingResults: string;
  };
  petDetail: {
    adoptionFee: string;
    intakeDate: string;
    weight: string;
    breed: string;
    rescueNarrative: string;
    vetClearanceTitle: string;
    vaccinatedTitle: string;
    vaccinatedSub: string;
    spayedTitle: string;
    spayedSub: string;
    chippedTitle: string;
    chippedSub: string;
    specialCareTitle: string;
    compatibilityTitle: string;
    goodWithDogs: string;
    goodWithCats: string;
    goodWithKids: string;
    energyLevel: string;
    good: string;
    noDogs: string;
    noCats: string;
    kidSafe: string;
    adultsOnly: string;
    sanctuaryLocationHours: string;
    sanctuaryAddress: string;
    applyToAdopt: string;
    adoptionPending: string;
    underCareNotice: string;
    updatesTitle: string;
    noUpdates: string;
    whatsAppUs: string;
    sponsorCare: string;
    sponsoredBySupporters: string;
    sponsoredByOneSupporter: string;
    fullySponsored: string;
    sponsorAnyway: string;
    fundingProgress: string;
    fundingProgressLabel: string;
    careProgram: string;
    sponsorSupported: string;
    tabAbout: string;
    tabStatus: string;
    tabUpdates: string;
    tabSupport: string;
    sponsorPetPerksTitle: string;
    sponsorPetPerksDesc: string;
    fosterInquiryTitle: string;
    fosterInquiryDesc: string;
    fosterWhatsAppBtn: string;
  };
  medicalTimeline: {
    title: string;
    subtitle: string;
    verifiedBy: string;
    noRecords: string;
  };
  adoptionForm: {
    title: string;
    titleWithPet: string;
    subtitle: string;
    selectedPetLabel: string;
    applicantNameLabel: string;
    applicantNamePlaceholder: string;
    emailLabel: string;
    phoneLabel: string;
    addressLabel: string;
    addressPlaceholder: string;
    housingTypeLabel: string;
    housingOwnHouse: string;
    housingRentHouse: string;
    housingApartment: string;
    housingCondo: string;
    housingOther: string;
    fencedYardLabel: string;
    yardYes: string;
    yardNo: string;
    yardNA: string;
    currentPetsLabel: string;
    petsNone: string;
    petsDogs: string;
    petsCats: string;
    petsBoth: string;
    petsOther: string;
    currentPetDetailsLabel: string;
    currentPetDetailsPlaceholder: string;
    householdExperienceLabel: string;
    expFirstTime: string;
    expSome: string;
    expExperienced: string;
    notesLabel: string;
    notesPlaceholder: string;
    termsAgreement: string;
    submitButton: string;
    successTitle: string;
    successMessage: string;
    referenceIdLabel: string;
    nextStepsTitle: string;
    nextStep1: string;
    nextStep2: string;
    nextStep3: string;
    closeButton: string;
    trackButton: string;
  };
  tracking: {
    badge: string;
    title: string;
    subtitle: string;
    refLabel: string;
    refPlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    button: string;
    loadingButton: string;
    timelineTitle: string;
    step1: string;
    step1Sub: string;
    step2: string;
    step2Sub: string;
    step3: string;
    step3Sub: string;
    step4: string;
    step4Sub: string;
    step5: string;
    step5Sub: string;
    meetGreetTitle: string;
    dateTimeLabel: string;
    formatLabel: string;
    locationLabel: string;
    virtualMeeting: string;
    inPersonMeeting: string;
    coordinatorNote: string;
    joinMeetingBtn: string;
    viewMapBtn: string;
    approvedTitle: string;
    approvedDesc: string;
    checklistTitle: string;
    checklistItem1: string;
    checklistItem2: string;
    checklistItem3: string;
    reviewTitle: string;
    reviewDesc: string;
    closedTitle: string;
    closedDesc: string;
    viewOtherPetsBtn: string;
    helplineTitle: string;
    helplineHours: string;
    whatsAppBtn: string;
    callBtn: string;
  };
  donations: {
    badge: string;
    title: string;
    subtitle: string;
    freeAdoptionGuarantee: string;
    widgetTitle: string;
    selectTierLabel: string;
    customAmountLabel: string;
    frequencyOneTime: string;
    frequencyMonthly: string;
    taxReliefNoticeDesc: string;
    dedicateLabel: string;
    dedicatePlaceholder: string;
    donorNameLabel: string;
    donorEmailLabel: string;
    donorPhoneLabel: string;
    donorIcLabel: string;
    donorNotesLabel: string;
    bankTransferTitle: string;
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    copyAccountBtn: string;
    copiedBtn: string;
    duitNowScanTitle: string;
    duitNowInstructions: string;
    pledgeBtn: string;
    pledgeProcessing: string;
    receiptTitle: string;
    receiptSubtitle: string;
    printReceiptBtn: string;
    transparencyTitle: string;
    transparencySubtitle: string;
    transparencyDesc: string;
    wishlistTitle: string;
    wishlistSubtitle: string;
    wishlistDesc: string;
    dropOffLocationTitle: string;
    visitingHoursTitle: string;
    contactTitle: string;
    faqsTitle: string;
    faqsSubtitle: string;
    meetAnimalsCTA: string;
    choosePetTitle: string;
    choosePetSubtitle: string;
    generalSanctuaryFund: string;
    generalSanctuaryFundDesc: string;
    companionTierTitle: string;
    perkMonthlyUpdates: string;
    perkDigitalCertificate: string;
    perkSanctuaryVisits: string;
  };
  bulletins: {
    badge: string;
    title: string;
    subtitle: string;
    filterAll: string;
    filterFoster: string;
    filterMedical: string;
    filterEvent: string;
    filterGeneral: string;
    urgentBadge: string;
    contactCoordinator: string;
    allNoticesTitle: string;
    categoryUrgentNeed: string;
    categoryClinic: string;
    categoryEvent: string;
    categoryHappyTail: string;
    categoryAnnouncement: string;
    pinned: string;
    postedBy: string;
    noUpdates: string;
  };
  footer: {
    orgDesc: string;
    quickLinksTitle: string;
    visitingHoursTitle: string;
    visitingHoursSchedule: string;
    closedMondays: string;
    locationContactTitle: string;
    address: string;
    privacyNotice: string;
    adoptionTerms: string;
    staffPortal: string;
    copyright: string;
  };
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    nav: {
      adoptablePets: "Adoptable Pets",
      donate: "Donate & Sponsor",
      trackApplication: "Track Application Status",
      bulletins: "Shelter Bulletins",
      adoptOrFoster: "Adopt or Foster",
      volunteer: "Volunteer",
      matchQuiz: "Match Quiz",
      sponsor: "Sponsor Care",
      adopt: "Adopt",
      sanctuaryLocation: "Petaling Jaya, Selangor",
      phone: SHELTER_PHONE_DISPLAY,
      visitingHours: "Tue–Sun: 10:00 AM – 5:00 PM",
      browsePets: "Browse Pets",
      transparency: "Where Your Money Goes",
      sponsorWall: "Public Sponsor Wall",
    },
    common: {
      freeAdoption: "100% Free Adoption",
      available: "Available",
      pending: "Pending",
      adopted: "Adopted",
      inRehabilitation: "In Rehabilitation",
      rehabStage: "Rehabilitation Stage",
      rehabProgress: "Recovery Progress",
      sponsorMe: "Sponsor Me",
      dog: "Dog",
      cat: "Cat",
      other: "Other",
      dogs: "Dogs",
      cats: "Cats",
      all: "All",
      male: "Male",
      female: "Female",
      small: "Small",
      medium: "Medium",
      large: "Large",
      puppyKitten: "Puppy / Kitten",
      young: "Young Adult",
      adult: "Mature Adult",
      senior: "Senior",
      low: "Low",
      moderate: "Moderate",
      high: "High",
      search: "Search",
      searchPlaceholder: "Search by name, breed, or personality tag...",
      filter: "Filter",
      resetFilters: "Reset Filters",
      details: "Details",
      apply: "Apply to Adopt",
      sponsor: "Sponsor Care",
      share: "Share",
      sharePet: "Share Pet",
      linkCopied: "Link Copied!",
      back: "Back",
      backToAllPets: "Back to All Pets",
      close: "Close",
      submit: "Submit Application",
      submitting: "Submitting...",
      loading: "Loading...",
      verified: "Verified",
    },
    hero: {
      badge: "Animal Welfare & Rescue Sanctuary",
      title: "Adopt a dog or cat from your local shelter.",
      subtitle: "We take in strays, owner surrenders, and transfers. Every rescue animal receives full veterinary care, core vaccinations, microchip registration, and spay/neuter surgery before finding their forever family.",
      browseBtn: "Browse Adoptable Pets",
      quizBtn: "Pet Compatibility Quiz",
      sponsorBtn: "Sponsor Care",
      visitingHoursLabel: "Sanctuary Visiting Hours:",
      visitingHoursText: "Tuesday through Sunday, 10:00 AM – 5:00 PM. Walk-ins welcome.",
      locationText: "Petaling Jaya, Selangor",
      tnrmHeadline: "Coexistence through TNRM & Education",
    },
    home: {
      bulletinsTitle: "From the shelter",
      bulletinsSubtitle: "Rescue updates, clinic notes, and news from the sanctuary.",
      availableTitle: "Adoptable Animals",
      availableSubtitle: "Rescued dogs, cats and kittens waiting for a home right now.",
      viewAllPets: "View All Adoptable Pets",
      galleryLoading: "Loading rescue animals...",
      howItWorksTitle: "Application Steps",
      step1Title: "Browse & Submit Application",
      step1Desc: "Browse our dogs and cats online or visit our sanctuary, then submit a short application. We check basic home suitability — landed vs high-rise pet guidelines, safe fencing, and household agreement.",
      step2Title: "Meet & Socialize",
      step2Desc: "Spend time interacting with the animal in our outdoor play yard or cat room. If you have resident pets, we arrange a structured, supervised introduction.",
      step3Title: "Finalize & Welcome Home",
      step3Desc: "Sign the adoption or foster agreement, with no commercial adoption fees. All animals are already vaccinated, microchipped, and spayed or neutered. If your circumstances ever change, we will always take the animal back.",
      protocolsTitle: "Our Animal Welfare Standards",
      protocolsSubtitle: "Built upon clinical veterinary rigor, lifetime accountability, and unconditional compassion.",
      protocol1Title: "Complete Veterinary Protocol",
      protocol1Desc: "Every rescue animal undergoes full veterinary health screening, spay/neuter surgery, core vaccinations (6-in-1 / FVRCP), internal deworming, and microchip registration before rehoming.",
      protocol2Title: "100% Free Adoption Policy",
      protocol2Desc: "We do not sell animals or charge commercial adoption fees. Rescues are placed into qualified homes purely based on lifestyle compatibility and animal welfare.",
      protocol3Title: "Post-Adoption Guidance & Safety Net",
      protocol3Desc: "Our team provides ongoing behavioral transition guidance. If an adopter's life circumstances ever change, we maintain an unconditional open-door policy to welcome the animal back.",
      protocol4Title: "Structured Premise & Lifestyle Review",
      protocol4Desc: "We verify basic living suitability (landed housing vs high-rise pet guidelines, fenced perimeter safety, and household consensus) to ensure a safe, lasting match.",
    },
    pets: {
      title: "Adoptable Animals",
      subtitle: "Browse rescued dogs, cats, and kittens awaiting their forever homes.",
      speciesFilter: "Species",
      genderFilter: "Gender",
      ageFilter: "Age Group",
      sizeFilter: "Size",
      statusFilter: "Status",
      trackFilter: "Filter by care track",
      trackAdoptable: "Adoptable",
      trackRehabilitation: "In Rehabilitation",
      trackAlumni: "Adopted",
      noResultsTitle: "No animals match your search filters",
      noResultsDesc: "Try adjusting your filter criteria or clear all filters to see all adoptable rescues.",
      showingResults: "Showing adoptable pets",
    },
    petDetail: {
      adoptionFee: "Adoption Fee",
      intakeDate: "Rescue Intake Date",
      weight: "Weight",
      breed: "Breed",
      rescueNarrative: "Rescue Narrative & Background",
      vetClearanceTitle: "Veterinary Clearance & Medical Status",
      vaccinatedTitle: "Core Vaccinated",
      vaccinatedSub: "DHPPi / FVRCP series",
      spayedTitle: "Spayed / Neutered",
      spayedSub: "Certified sterile",
      chippedTitle: "Microchipped",
      chippedSub: "Registered ISO ID",
      specialCareTitle: "Special Care Note",
      compatibilityTitle: "Household Compatibility & Temperament",
      goodWithDogs: "Dogs",
      goodWithCats: "Cats",
      goodWithKids: "Children",
      energyLevel: "Energy Level",
      good: "Good",
      noDogs: "No Dogs",
      noCats: "No Cats",
      kidSafe: "Kid-Safe",
      adultsOnly: "Adults Only",
      sanctuaryLocationHours: "Sanctuary Location & Visiting Hours",
      sanctuaryAddress: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor • Open Tue–Sun: 10:00 AM – 5:00 PM",
      applyToAdopt: "Apply to Adopt",
      adoptionPending: "Adoption Pending",
      underCareNotice:
        "Under veterinary care — not yet available for adoption. Sponsorship funds this animal's treatment.",
      updatesTitle: "Progress Updates",
      noUpdates: "No progress updates have been recorded yet.",
      whatsAppUs: "WhatsApp Us",
      sponsorCare: "Sponsor Care",
      sponsoredBySupporters: "Currently sponsored by {count} supporters",
      sponsoredByOneSupporter: "Currently sponsored by 1 supporter",
      fullySponsored: "Fully Sponsored — View Others",
      sponsorAnyway: "Sponsor anyway",
      fundingProgress: "{funded} of {goal} raised for care",
      fundingProgressLabel: "{percent}% of care costs funded",
      careProgram: "Care Program",
      sponsorSupported: "Sponsor Supported",
      tabAbout: "About Me",
      tabStatus: "Status & Health",
      tabUpdates: "Updates Feed",
      tabSupport: "Support & Inquiry",
      sponsorPetPerksTitle: "Monthly Rescue Companion (RM 30/mo)",
      sponsorPetPerksDesc: "Sponsor this rescue animal monthly to receive personalized updates and help fund ongoing care.",
      fosterInquiryTitle: "Foster-to-Adopt & Care Inquiry",
      fosterInquiryDesc: "This animal is in clinical rehabilitation. Inquire about temporary fostering or meet-and-greet when recovered.",
      fosterWhatsAppBtn: "Inquire via WhatsApp",
    },
    medicalTimeline: {
      title: "Rescue Intake & Medical Care Timeline",
      subtitle: "Verified chronological clinical history, diagnostic screenings, treatments, and veterinary clearances.",
      verifiedBy: "Verified by",
      noRecords: "No veterinary records yet.",
    },
    adoptionForm: {
      title: "Hope for Strays Adoption Application",
      titleWithPet: "Adoption Application for",
      subtitle: "Applications take about 5 minutes. Our volunteer coordinators will review and follow up within 1–2 business days.",
      selectedPetLabel: "Selected Rescue Animal",
      applicantNameLabel: "Full Name (as per IC / Passport) *",
      applicantNamePlaceholder: "e.g. Nurul Huda binti Ahmad",
      emailLabel: "Email Address *",
      phoneLabel: "Contact Phone Number (WhatsApp accessible) *",
      addressLabel: "Residential Address (State & Postcode) *",
      addressPlaceholder: "e.g. No. 24, Jalan SS 2/10, 47300 Petaling Jaya, Selangor",
      housingTypeLabel: "Housing & Accommodation Type *",
      housingOwnHouse: "Landed House with Yard (Owned)",
      housingRentHouse: "Landed House with Yard (Rented)",
      housingApartment: "Apartment / Flat (Pet-friendly rules)",
      housingCondo: "Condominium (Pet-friendly management)",
      housingOther: "Other Property Type",
      fencedYardLabel: "Perimeter Fencing & Gate Security *",
      yardYes: "Fully Fenced Perimeter (Secure gate)",
      yardNo: "Open Compound / Unfenced Yard",
      yardNA: "Not Applicable (Indoor high-rise)",
      currentPetsLabel: "Current Resident Household Pets *",
      petsNone: "No current pets",
      petsDogs: "Yes, currently have dog(s)",
      petsCats: "Yes, currently have cat(s)",
      petsBoth: "Yes, have both dogs and cats",
      petsOther: "Other small animals",
      currentPetDetailsLabel: "Resident Pets Details (Breeds, Ages, Neutered Status)",
      currentPetDetailsPlaceholder: "e.g. 1 spayed female local cat (3 yrs), vaccinated.",
      householdExperienceLabel: "Pet Ownership Experience *",
      expFirstTime: "First-time pet owner",
      expSome: "Some past experience with pets",
      expExperienced: "Experienced pet owner & primary caregiver",
      notesLabel: "Household Daily Routine & Living Notes (Optional)",
      notesPlaceholder: "Share details about daily schedule, exercise arrangements, and who will look after the pet during work hours...",
      termsAgreement: "I agree to the Shelter Adoption Terms, confirm all household members consent, and promise never to abandon or commercially breed this animal.",
      submitButton: "Submit 100% Free Adoption Application",
      successTitle: "Adoption Application Submitted!",
      successMessage: "Thank you for opening your heart to a shelter rescue! Your reference ID is:",
      referenceIdLabel: "Application Reference Code",
      nextStepsTitle: "What happens next?",
      nextStep1: "Our adoption team will review your application within 24–48 hours.",
      nextStep2: "We will contact you via WhatsApp to arrange an in-person Meet & Greet at our sanctuary.",
      nextStep3: "Track live status anytime at /applications/track using your Reference ID and Email.",
      closeButton: "Close",
      trackButton: "Track Live Application Status",
    },
    tracking: {
      badge: "Adopter Self-Service Portal",
      title: "Track Application Status",
      subtitle: "Enter your reference ID to see where your application stands.",
      refLabel: "Application Reference ID *",
      refPlaceholder: "e.g. app-1723738192000",
      emailLabel: "Applicant Email Address *",
      emailPlaceholder: "your.email@example.com",
      button: "Check Application Status",
      loadingButton: "Querying Records...",
      timelineTitle: "Adoption Review Timeline",
      // Unnumbered: the tracking rail renders the position from the milestone
      // list, so inserting a step cannot leave these labels counting wrongly.
      step1: "Received",
      step1Sub: "In Queue",
      step2: "Review",
      step2Sub: "Coordinator Screen",
      step3: "Meet & Greet",
      step3Sub: "Interaction",
      step4: "Home Visit",
      step4Sub: "Safety Check",
      step5: "Decision",
      step5Sub: "Homebound",
      meetGreetTitle: "Scheduled Meet & Greet Appointment",
      dateTimeLabel: "Date & Time:",
      formatLabel: "Format:",
      locationLabel: "Location / Link:",
      virtualMeeting: "Virtual Video Call",
      inPersonMeeting: "In-Person Shelter Visit",
      coordinatorNote: "Coordinator Note:",
      joinMeetingBtn: "Join Video Meeting →",
      viewMapBtn: "View Location on Google Maps",
      approvedTitle: "Congratulations! Your Adoption is Approved!",
      approvedDesc: "Our adoption coordinator has officially approved your application. You are welcome to come to the shelter to complete the 100% Free Adoption formalities and collect the animal's medical passport.",
      checklistTitle: "Checklist for Adoption Day:",
      checklistItem1: "Original IC or Passport for adoption charter signing.",
      checklistItem2: "Pet carrier (for cats) or secure collar/leash (for dogs).",
      checklistItem3: "Complete free vaccination & microchip registration transfer.",
      reviewTitle: "Review Currently in Progress",
      reviewDesc: "Our team is reviewing your household profile. We will reach out via WhatsApp or email to confirm a Meet & Greet time slot.",
      closedTitle: "Application Status: Closed",
      closedDesc: "Thank you for your interest. After evaluating all submissions and the specific temperament requirements of this rescue, we were unable to proceed with this match.",
      viewOtherPetsBtn: "View Other Available Rescues",
      helplineTitle: "Hope for Strays Sanctuary & Helpline",
      helplineHours: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor • Hours: Tue – Sun 10am – 5pm",
      whatsAppBtn: "WhatsApp Coordinator",
      callBtn: SHELTER_PHONE_DISPLAY,
    },
    donations: {
      badge: "Direct Rescue Giving & Sponsorship",
      title: "Donate & Sponsor",
      subtitle: "Every ringgit directly supports emergency surgeries, core vaccinations, and wholesome meals at our sanctuary. Because of your generosity, 100% of our rescued animals are rehomed through our Free Adoption policy.",
      freeAdoptionGuarantee: "100% Free Adoption Guarantee",
      widgetTitle: "Make a Gift",
      selectTierLabel: "Select Giving Tier",
      customAmountLabel: "Or Enter Custom Amount (MYR)",
      frequencyOneTime: "One-time Donation",
      frequencyMonthly: "Monthly Rescue Hero",
      taxReliefNoticeDesc: "Provide your name and email so we can confirm your pledge.",
      dedicateLabel: "Dedicate or Sponsor a Specific Pet (Optional)",
      dedicatePlaceholder: "e.g. For Bella's surgery recovery / Milo's care",
      donorNameLabel: "Donor Full Name *",
      donorEmailLabel: "Email Address (to receive e-Receipt) *",
      donorPhoneLabel: "Phone Number (WhatsApp receipt updates)",
      // No baked-in "*": this field is required only when the donor asks for a
      // Section 44(6) receipt, so the marker is rendered from that state instead.
      donorIcLabel: "Malaysian IC / Passport / SSM Company No.",
      donorNotesLabel: "Special Message / Donor Wishes (Optional)",
      bankTransferTitle: "Direct Bank Transfer (Maybank)",
      bankName: "Maybank Berhad",
      accountNumber: "5140 1234 5678",
      accountHolder: "Pertubuhan Kebajikan Hope for Strays",
      copyAccountBtn: "Copy Bank Account",
      copiedBtn: "Copied!",
      duitNowScanTitle: "DuitNow National QR Pay",
      duitNowInstructions: "Scan using Maybank MAE, CIMB Clicks, Touch 'n Go eWallet, Public Bank, or any Malaysian banking app.",
      pledgeBtn: "Complete Donation Pledge & Generate e-Receipt",
      pledgeProcessing: "Recording Pledge...",
      receiptTitle: "Official Donation e-Receipt",
      receiptSubtitle: "Approved Under Subsection 44(6) Income Tax Act 1967 • Ref: {taxRef}",
      printReceiptBtn: "Print Official Receipt",
      transparencyTitle: "Financial Accountability",
      transparencySubtitle: "Where Your Donation Goes",
      transparencyDesc: "We operate with strict financial transparency. Direct public donations are allocated entirely to animal medical treatment, high-protein sustenance, and sanitary shelter housing.",
      wishlistTitle: "In-Kind Giving",
      wishlistSubtitle: "Shelter Supplies Wishlist",
      wishlistDesc: "Prefer to donate items directly? We gladly accept physical drop-offs of unopened food, medical supplies, and shelter bedding at our Petaling Jaya sanctuary.",
      dropOffLocationTitle: "Drop-off Location",
      visitingHoursTitle: "Visiting & Drop-off Hours",
      contactTitle: "Direct Contact",
      faqsTitle: "Clear Answers",
      faqsSubtitle: "Frequently Asked Questions About Donations",
      meetAnimalsCTA: "Meet Our Adoptable Animals",
      choosePetTitle: "Dedicate Sponsorship to a Specific Animal",
      choosePetSubtitle: "Select an animal under sanctuary care or sponsor our general rescue fund",
      generalSanctuaryFund: "General Sanctuary Fund",
      generalSanctuaryFundDesc: "Allocates funds flexibly where urgently needed most across all animals",
      companionTierTitle: "Rescue Companion & Updates",
      perkMonthlyUpdates: "Monthly Photo & Video Progress Report",
      perkDigitalCertificate: "Personalized Digital Sponsorship Certificate",
      perkSanctuaryVisits: "Invitation to arrange occasional sanctuary visits",
    },
    bulletins: {
      badge: "Community & Rescue Bulletins",
      title: "Shelter Bulletins",
      subtitle: "Official announcements, emergency foster appeals, and community adoption drive notices from our sanctuary.",
      filterAll: "All Notices",
      filterFoster: "Urgent Fosters",
      filterMedical: "Medical Care",
      filterEvent: "Events",
      filterGeneral: "General",
      urgentBadge: "Urgent Notice",
      contactCoordinator: "WhatsApp Coordinator",
      allNoticesTitle: "All Bulletins",
      categoryUrgentNeed: "Urgent Foster / Need",
      categoryClinic: "Clinic / Vaccine",
      categoryEvent: "Event",
      categoryHappyTail: "Adoption Update",
      categoryAnnouncement: "Notice",
      pinned: "Pinned",
      postedBy: "Posted by:",
      noUpdates: "No updates to show right now.",
    },
    footer: {
      orgDesc: "A registered non-profit animal rescue organisation serving Petaling Jaya and Selangor since 2016. Dedicated to rescuing, rehabilitating, and rehoming homeless dogs and cats.",
      quickLinksTitle: "Quick Links",
      visitingHoursTitle: "Visiting Hours",
      visitingHoursSchedule: "Tuesday – Sunday: 10:00 AM – 5:00 PM",
      closedMondays: "Closed Mondays for sanctuary deep cleaning",
      locationContactTitle: "Location & Contact",
      address: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia",
      privacyNotice: "Privacy Notice (PDPA)",
      adoptionTerms: "Adoption Terms",
      staffPortal: "Staff Portal",
      copyright: "Hope for Strays. All rights reserved.",
    },
  },
  ms: {
    nav: {
      adoptablePets: "Haiwan Angkat",
      donate: "Derma & Penajaan",
      trackApplication: "Semak Status Permohonan",
      bulletins: "Buletin Pusat Perlindungan",
      adoptOrFoster: "Adopsi atau Asuh",
      volunteer: "Sukarelawan",
      matchQuiz: "Kuiz Padanan",
      sponsor: "Taja Rawatan",
      adopt: "Adopsi",
      sanctuaryLocation: "Petaling Jaya, Selangor",
      phone: SHELTER_PHONE_DISPLAY,
      visitingHours: "Sel–Ahad: 10:00 PG – 5:00 PTG",
      browsePets: "Lihat Haiwan",
      transparency: "Ke Mana Wang Anda Pergi",
      sponsorWall: "Dinding Penaja Awam",
    },
    common: {
      freeAdoption: "Adopsi 100% Percuma",
      available: "Tersedia",
      pending: "Sedang Diproses",
      adopted: "Telah Diadopsi",
      inRehabilitation: "Dalam Pemulihan",
      rehabStage: "Peringkat Pemulihan",
      rehabProgress: "Kemajuan Pemulihan",
      sponsorMe: "Tajai Saya",
      dog: "Anjing",
      cat: "Kucing",
      other: "Lain-lain",
      dogs: "Anjing",
      cats: "Kucing",
      all: "Semua",
      male: "Jantan",
      female: "Betina",
      small: "Kecil",
      medium: "Sederhana",
      large: "Besar",
      puppyKitten: "Anak Haiwan",
      young: "Dewasa Muda",
      adult: "Dewasa Matang",
      senior: "Warga Emas",
      low: "Rendah",
      moderate: "Sederhana",
      high: "Tinggi",
      search: "Cari",
      searchPlaceholder: "Cari mengikut nama, baka, atau personaliti...",
      filter: "Tapis",
      resetFilters: "Set Semula",
      details: "Maklumat",
      apply: "Mohon Adopsi",
      sponsor: "Taja Rawatan",
      share: "Kongsi",
      sharePet: "Kongsi Profil",
      linkCopied: "Pautan Disalin!",
      back: "Kembali",
      backToAllPets: "Kembali ke Senarai Haiwan",
      close: "Tutup",
      submit: "Hantar Permohonan",
      submitting: "Menghantar...",
      loading: "Memuatkan...",
      verified: "Disahkan",
    },
    hero: {
      badge: "Pusat Kebajikan & Penyelamatan Haiwan",
      title: "Angkat anjing atau kucing dari pusat perlindungan setempat anda.",
      subtitle: "Kami menyelamatkan haiwan terbiar dan serahan. Setiap haiwan reskue menerima rawatan veterinar lengkap, vaksinasi teras, pendaftaran cip mikro, dan pemandulan sebelum mencari keluarga selamanya.",
      browseBtn: "Lihat Haiwan Sedia Diadopsi",
      quizBtn: "Kuiz Keserasian Haiwan",
      sponsorBtn: "Taja Kos Penjagaan",
      visitingHoursLabel: "Waktu Lawatan Pusat:",
      visitingHoursText: "Selasa hingga Ahad, 10:00 Pagi – 5:00 Petang. Lawatan terus dialu-alukan.",
      locationText: "Petaling Jaya, Selangor",
      tnrmHeadline: "Kewujudan Bersama melalui TNRM & Pendidikan",
    },
    home: {
      bulletinsTitle: "Dari pusat perlindungan",
      bulletinsSubtitle: "Kemas kini penyelamatan, nota klinik dan berita dari santuari.",
      availableTitle: "Haiwan Sedia Diadopsi",
      availableSubtitle: "Anjing, kucing dan anak kucing reskue yang sedang menanti rumah baharu.",
      viewAllPets: "Lihat Semua Haiwan Sedia Diadopsi",
      galleryLoading: "Memuatkan haiwan reskue...",
      howItWorksTitle: "Langkah Permohonan",
      step1Title: "Semak & Hantar Permohonan",
      step1Desc: "Lihat profil anjing & kucing reskue kami secara dalam talian atau kunjungi santuari kami. Hantar borang ringkas — kami menyemak kesesuaian asas kediaman anda (pagar selamat, garis panduan bangunan bertingkat, persetujuan isi rumah).",
      step2Title: "Sesi Suai Kenal & Interaksi",
      step2Desc: "Luangkan masa berinteraksi bersama haiwan pilihan di kawasan riadah luar atau bilik kucing. Pengenalan terselia disediakan jika anda mempunyai haiwan sedia ada.",
      step3Title: "Tandatangan Perjanjian & Bawa Pulang",
      step3Desc: "Tandatangani perjanjian adopsi atau asuhan tanpa sebarang yuran adopsi komersial. Semua haiwan telah lengkap divaksin, dipasang cip mikro dan dimandulkan. Jika keadaan hidup anda berubah, kami sentiasa menerima haiwan itu kembali.",
      protocolsTitle: "Piawaian Kebajikan Haiwan Kami",
      protocolsSubtitle: "Berasaskan ketelitian klinikal veterinar, kebertanggungjawaban sepanjang hayat, dan belas kasihan.",
      protocol1Title: "Protokol Veterinar Lengkap",
      protocol1Desc: "Setiap haiwan reskue melalui saringan kesihatan veterinar menyeluruh, pembedahan pemandulan, vaksinasi teras (6-dalam-1 / FVRCP), nyahcacing, dan pendaftaran cip mikro.",
      protocol2Title: "Polisi Adopsi 100% Percuma",
      protocol2Desc: "Kami tidak menjual haiwan atau mengenakan sebarang yuran adopsi komersial. Pemadanan dibuat berdasarkan keserasian gaya hidup dan kebajikan haiwan.",
      protocol3Title: "Bimbingan & Jaminan Sepanjang Hayat",
      protocol3Desc: "Pasukan kami menyediakan panduan transisi tingkah laku berterusan. Jika keadaan hidup pengadopsi berubah, pintu kami sentiasa terbuka untuk menerima haiwan kembali.",
      protocol4Title: "Semakan Kediaman & Keselamatan",
      protocol4Desc: "Kami mengesahkan kesesuaian asas kediaman (garis panduan rumah bertanah vs bertingkat, pagar selamat, dan persetujuan seisi rumah) demi pemadanan kekal.",
    },
    pets: {
      title: "Haiwan Sedia Diangkat Anak",
      subtitle: "Semak senarai anjing, kucing, dan anak haiwan yang menanti keluarga penyayang.",
      speciesFilter: "Spesis",
      genderFilter: "Jantina",
      ageFilter: "Kumpulan Umur",
      sizeFilter: "Saiz",
      statusFilter: "Status",
      trackFilter: "Tapis mengikut trek penjagaan",
      trackAdoptable: "Sedia Diadopsi",
      trackRehabilitation: "Dalam Pemulihan",
      trackAlumni: "Telah Diadopsi",
      noResultsTitle: "Tiada haiwan sepadan dengan tapisan carian anda",
      noResultsDesc: "Cuba laraskan kriteria tapisan anda atau set semula tapisan untuk melihat semua haiwan.",
      showingResults: "Memaparkan haiwan sedia diadopsi",
    },
    petDetail: {
      adoptionFee: "Yuran Adopsi",
      intakeDate: "Tarikh Penyelamatan / Kemasukan",
      weight: "Berat Badan",
      breed: "Baka",
      rescueNarrative: "Kisah Penyelamatan & Latar Belakang",
      vetClearanceTitle: "Pengesahan Veterinar & Status Perubatan",
      vaccinatedTitle: "Lengkap Vaksin",
      vaccinatedSub: "Siri DHPPi / FVRCP",
      spayedTitle: "Telah Dimandulkan",
      spayedSub: "Disahkan steril",
      chippedTitle: "Cip Mikro Dipasang",
      chippedSub: "Daftar ID ISO 15-Digit",
      specialCareTitle: "Nota Penjagaan Khusus",
      compatibilityTitle: "Keserasian Isi Rumah & Personaliti",
      goodWithDogs: "Anjing Lain",
      goodWithCats: "Kucing Lain",
      goodWithKids: "Kanak-kanak",
      energyLevel: "Tahap Tenaga",
      good: "Sesuai",
      noDogs: "Tidak Sesuai",
      noCats: "Tidak Sesuai",
      kidSafe: "Mesra Kanak-kanak",
      adultsOnly: "Dewasa Sahaja",
      sanctuaryLocationHours: "Lokasi Pusat Perlindungan & Waktu Lawatan",
      sanctuaryAddress: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor • Buka Sel–Ahad: 10:00 PG – 5:00 PTG",
      applyToAdopt: "Mohon untuk Mengangkat Anak",
      adoptionPending: "Adopsi Sedang Diproses",
      underCareNotice:
        "Dalam rawatan veterinar — belum tersedia untuk adopsi. Tajaan membiayai rawatan haiwan ini.",
      updatesTitle: "Kemas Kini Kemajuan",
      noUpdates: "Tiada kemas kini kemajuan direkodkan setakat ini.",
      whatsAppUs: "Hubungi WhatsApp",
      sponsorCare: "Taja Rawatan",
      sponsoredBySupporters: "Kini ditaja oleh {count} penyumbang",
      sponsoredByOneSupporter: "Kini ditaja oleh 1 penyumbang",
      fullySponsored: "Tajaan Penuh — Lihat Haiwan Lain",
      sponsorAnyway: "Taja juga",
      fundingProgress: "{funded} daripada {goal} terkumpul untuk rawatan",
      fundingProgressLabel: "{percent}% kos rawatan telah terkumpul",
      careProgram: "Program Rawatan",
      sponsorSupported: "Perlu Penajaan",
      tabAbout: "Tentang Saya",
      tabStatus: "Status & Kesihatan",
      tabUpdates: "Kemas Kini Kemajuan",
      tabSupport: "Sokong & Pertanyaan",
      sponsorPetPerksTitle: "Rakan Penaja Bulanan (RM 30/bln)",
      sponsorPetPerksDesc: "Taja haiwan reskue ini setiap bulan untuk menerima kemas kini peribadi dan membiayai rawatan berterusan.",
      fosterInquiryTitle: "Pertanyaan Asuhan & Penjagaan",
      fosterInquiryDesc: "Haiwan ini sedang dalam pemulihan klinikal. Hubungi untuk asuhan sementara atau suai kenal selepas pulih.",
      fosterWhatsAppBtn: "Pertanyaan melalui WhatsApp",
    },
    medicalTimeline: {
      title: "Garis Masa Penyelamatan & Penjagaan Veterinar",
      subtitle: "Rekod klinikal kronologi disahkan, saringan diagnostik, rawatan, dan pengesahan veterinar.",
      verifiedBy: "Disahkan oleh",
      noRecords: "Belum ada rekod veterinar.",
    },
    adoptionForm: {
      title: "Borang Permohonan Adopsi Hope for Strays",
      titleWithPet: "Borang Permohonan Adopsi untuk",
      subtitle: "Borang mengambil masa sekitar 5 minit. Penyelaras sukarelawan kami akan menyemak dan menghubungi anda dalam 1–2 hari bekerja.",
      selectedPetLabel: "Haiwan Reskue Pilihan",
      applicantNameLabel: "Nama Penuh (mengikut Kad Pengenalan / Pasport) *",
      applicantNamePlaceholder: "cth. Nurul Huda binti Ahmad",
      emailLabel: "Alamat E-mel *",
      phoneLabel: "Nombor Telefon Bimbit (boleh WhatsApp) *",
      addressLabel: "Alamat Kediaman (Negeri & Poskod) *",
      addressPlaceholder: "cth. No. 24, Jalan SS 2/10, 47300 Petaling Jaya, Selangor",
      housingTypeLabel: "Jenis Kediaman & Tempat Tinggal *",
      housingOwnHouse: "Rumah Bertanah dengan Halaman (Milik Sendiri)",
      housingRentHouse: "Rumah Bertanah dengan Halaman (Sewa)",
      housingApartment: "Pangsapuri / Flat (Peraturan mesra haiwan)",
      housingCondo: "Kondominium (Pengurusan mesra haiwan)",
      housingOther: "Jenis Hartanah Lain",
      fencedYardLabel: "Keselamatan Pagar & Pintu Masuk *",
      yardYes: "Kawasan Berpagar Penuh (Pintu masuk selamat)",
      yardNo: "Halaman Terbuka / Tanpa Pagar",
      yardNA: "Tidak Berkenaan (Kediaman bertingkat dalaman)",
      currentPetsLabel: "Haiwan Peliharaan Sedia Ada di Rumah *",
      petsNone: "Tiada haiwan peliharaan sedia ada",
      petsDogs: "Ya, ada memelihara anjing",
      petsCats: "Ya, ada memelihara kucing",
      petsBoth: "Ya, ada anjing dan kucing",
      petsOther: "Haiwan kecil lain",
      currentPetDetailsLabel: "Maklumat Haiwan Sedia Ada (Baka, Umur, Status Mandul)",
      currentPetDetailsPlaceholder: "cth. 1 ekor kucing tempatan betina telah dimandulkan (3 tahun), divaksin.",
      householdExperienceLabel: "Pengalaman Memelihara Haiwan *",
      expFirstTime: "Pertama kali memelihara haiwan",
      expSome: "Mempunyai sedikit pengalaman lalu",
      expExperienced: "Berpengalaman luas & penjaga utama",
      notesLabel: "Rutin Harian & Nota Kediaman (Pilihan)",
      notesPlaceholder: "Kongsikan jadual harian, susunan senaman, dan siapa yang menjaga haiwan semasa waktu bekerja...",
      termsAgreement: "Saya bersetuju dengan Syarat Adopsi Pusat Perlindungan, mengesahkan semua ahli keluarga bersetuju, dan berjanji tidak akan mengabaikan atau membiak haiwan ini secara komersial.",
      submitButton: "Hantar Permohonan Adopsi 100% Percuma",
      successTitle: "Permohonan Adopsi Telah Dihantar!",
      successMessage: "Terima kasih kerana sudi membuka pintu hati untuk haiwan reskue! Nombor rujukan permohonan anda ialah:",
      referenceIdLabel: "Nombor Rujukan Permohonan",
      nextStepsTitle: "Apakah langkah seterusnya?",
      nextStep1: "Pasukan adopsi kami akan menyemak permohonan anda dalam tempoh 24–48 jam.",
      nextStep2: "Kami akan menghubungi anda melalui WhatsApp untuk menetapkan sesi Suai Kenal di pusat perlindungan.",
      nextStep3: "Semak status terkini pada bila-bila masa di /applications/track menggunakan ID Rujukan dan E-mel anda.",
      closeButton: "Tutup",
      trackButton: "Semak Status Permohonan Terkini",
    },
    tracking: {
      badge: "Portal Layan Diri Pengadopsi",
      title: "Semak Status Permohonan",
      subtitle: "Masukkan ID rujukan anda untuk melihat status permohonan.",
      refLabel: "Nombor Rujukan Permohonan *",
      refPlaceholder: "cth. app-1723738192000",
      emailLabel: "Alamat E-mel Pemohon *",
      emailPlaceholder: "emel.anda@example.com",
      button: "Semak Status Permohonan",
      loadingButton: "Menyemak Rekod...",
      timelineTitle: "Garis Masa Semakan Adopsi",
      step1: "Diterima",
      step1Sub: "Dalam Giliran",
      step2: "Semakan",
      step2Sub: "Saringan Penyelaras",
      step3: "Suai Kenal",
      step3Sub: "Interaksi",
      step4: "Lawatan Rumah",
      step4Sub: "Pemeriksaan Keselamatan",
      step5: "Keputusan",
      step5Sub: "Ke Rumah Baharu",
      meetGreetTitle: "Temu Janji Sesi Suai Kenal",
      dateTimeLabel: "Tarikh & Masa:",
      formatLabel: "Format:",
      locationLabel: "Lokasi / Pautan:",
      virtualMeeting: "Panggilan Video Maya",
      inPersonMeeting: "Lawatan Fizikal ke Pusat Perlindungan",
      coordinatorNote: "Nota Penyelaras:",
      joinMeetingBtn: "Sertai Panggilan Video →",
      viewMapBtn: "Lihat Lokasi di Google Maps",
      approvedTitle: "Tahniah! Permohonan Adopsi Anda Telah Diluluskan!",
      approvedDesc: "Penyelaras adopsi kami telah meluluskan permohonan anda secara rasmi. Anda dijemput hadir ke pusat perlindungan untuk melengkapkan urusan Adopsi 100% Percuma dan mengambil pasport perubatan haiwan.",
      checklistTitle: "Senarai Semak Hari Adopsi:",
      checklistItem1: "Kad Pengenalan atau Pasport asal untuk tandatangan piagam adopsi.",
      checklistItem2: "Kotak pembawa haiwan (untuk kucing) atau kolar & tali leher (untuk anjing).",
      checklistItem3: "Pemindahan pendaftaran vaksin percuma & cip mikro.",
      reviewTitle: "Semakan Sedang Dijalankan",
      reviewDesc: "Pasukan kami sedang menyemak profil isi rumah anda. Kami akan menghubungi anda melalui WhatsApp atau emel untuk menetapkan sesi Suai Kenal.",
      closedTitle: "Status Permohonan: Ditutup",
      closedDesc: "Terima kasih atas minat anda. Selepas menilai semua permohonan dan keperluan personaliti haiwan ini, kami tidak dapat meneruskan pemadanan ini pada masa ini.",
      viewOtherPetsBtn: "Lihat Haiwan Lain yang Tersedia",
      helplineTitle: "Pusat Perlindungan & Talian Bantuan Hope for Strays",
      helplineHours: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor • Waktu: Sel – Ahad 10pg – 5ptg",
      whatsAppBtn: "WhatsApp Penyelaras",
      callBtn: SHELTER_PHONE_DISPLAY,
    },
    donations: {
      badge: "Sumbangan & Penajaan Terus",
      title: "Taja & Sumbang",
      subtitle: "Setiap ringgit disalurkan terus bagi pembedahan kecemasan, vaksinasi teras, dan makanan berkhasiat di pusat perlindungan kami. Berkat kemurahan hati anda, 100% haiwan reskue kami diserahkan melalui polisi Adopsi Percuma.",
      freeAdoptionGuarantee: "Jaminan Adopsi 100% Percuma",
      widgetTitle: "Buat Sumbangan",
      selectTierLabel: "Pilih Pakej Sumbangan",
      customAmountLabel: "Atau Masukkan Jumlah Tersuai (MYR)",
      frequencyOneTime: "Sumbangan Sekali Sahaja",
      frequencyMonthly: "Wira Reskue Bulanan",
      taxReliefNoticeDesc: "Sila masukkan nama dan emel anda supaya kami boleh mengesahkan ikrar anda.",
      dedicateLabel: "Dedikasikan atau Taja Haiwan Tertentu (Pilihan)",
      dedicatePlaceholder: "cth. Untuk pemulihan pembedahan Bella / penjagaan Milo",
      donorNameLabel: "Nama Penuh Penderma *",
      donorEmailLabel: "Alamat E-mel (untuk penerimaan e-Resit) *",
      donorPhoneLabel: "Nombor Telefon (makluman WhatsApp)",
      donorIcLabel: "No. Kad Pengenalan / Pasport / No. SSM Syarikat",
      donorNotesLabel: "Mesej Khas / Harapan Penderma (Pilihan)",
      bankTransferTitle: "Pindahan Bank Terus (Maybank)",
      bankName: "Maybank Berhad",
      accountNumber: "5140 1234 5678",
      accountHolder: "Pertubuhan Kebajikan Hope for Strays",
      copyAccountBtn: "Salin No. Akaun",
      copiedBtn: "Disalin!",
      duitNowScanTitle: "DuitNow QR Kebangsaan",
      duitNowInstructions: "Imbas menggunakan Maybank MAE, CIMB Clicks, Touch 'n Go eWallet, Public Bank, atau mana-mana aplikasi perbankan Malaysia.",
      pledgeBtn: "Sempurnakan Ikrar Sumbangan & Jana e-Resit",
      pledgeProcessing: "Merekodkan Ikrar Sumbangan...",
      receiptTitle: "e-Resit Sumbangan Rasmi",
      receiptSubtitle: "Diluluskan Di Bawah Subseksyen 44(6) Akta Cukai Pendapatan 1967 • No. Rujukan: {taxRef}",
      printReceiptBtn: "Cetak Resit Rasmi",
      transparencyTitle: "Akauntabiliti Kewangan",
      transparencySubtitle: "Ke Mana Sumbangan Anda Disalurkan",
      transparencyDesc: "Kami beroperasi dengan ketelusan kewangan yang ketat. Sumbangan awam diperuntukkan sepenuhnya untuk rawatan perubatan, makanan berprotein tinggi, dan penyelenggaraan pusat perlindungan di Selangor.",
      wishlistTitle: "Sumbangan Barangan Keperluan",
      wishlistSubtitle: "Senarai Keperluan Pusat Perlindungan",
      wishlistDesc: "Ingin mendermakan barangan secara terus? Kami menerima sumbangan makanan haiwan yang belum dibuka, bekalan perubatan, dan kain alas di pusat perlindungan kami di Petaling Jaya.",
      dropOffLocationTitle: "Lokasi Serahan",
      visitingHoursTitle: "Waktu Lawatan & Serahan",
      contactTitle: "Hubungan Terus",
      faqsTitle: "Jawapan Telus",
      faqsSubtitle: "Soalan Lazim Mengenai Sumbangan",
      meetAnimalsCTA: "Kenali Haiwan Sedia Diadopsi",
      choosePetTitle: "Dedikasikan Penajaan Kepada Haiwan Tertentu",
      choosePetSubtitle: "Pilih haiwan di pusat perlindungan atau taja dana reskue am",
      generalSanctuaryFund: "Dana Am Pusat Perlindungan",
      generalSanctuaryFundDesc: "Menyalurkan dana ke bahagian paling mendesak untuk semua haiwan",
      companionTierTitle: "Rakan Penaja Reskue & Kemas Kini",
      perkMonthlyUpdates: "Laporan Kemajuan Foto & Video Bulanan",
      perkDigitalCertificate: "Sijil Penajaan Digital Rasmi",
      perkSanctuaryVisits: "Jemputan untuk mengatur lawatan suai kenal berkala",
    },
    bulletins: {
      badge: "Buletin Komuniti & Reskue",
      title: "Buletin Pusat Perlindungan",
      subtitle: "Pengumuman rasmi, rayuan rumah asuhan kecemasan, dan notis program adopsi komuniti dari pusat perlindungan kami.",
      filterAll: "Semua Notis",
      filterFoster: "Asuhan Kecemasan",
      filterMedical: "Rawatan Perubatan",
      filterEvent: "Program",
      filterGeneral: "Umum",
      urgentBadge: "Notis Segera",
      contactCoordinator: "WhatsApp Penyelaras",
      allNoticesTitle: "Semua Buletin",
      categoryUrgentNeed: "Asuhan Segera / Keperluan",
      categoryClinic: "Klinik / Vaksin",
      categoryEvent: "Program",
      categoryHappyTail: "Perkembangan Adopsi",
      categoryAnnouncement: "Notis",
      pinned: "Disemat",
      postedBy: "Dihantar oleh:",
      noUpdates: "Tiada kemas kini untuk dipaparkan buat masa ini.",
    },
    footer: {
      orgDesc: "Pertubuhan kebajikan haiwan berdaftar yang berkhidmat di Petaling Jaya dan Selangor sejak 2016. Berdedikasi untuk menyelamatkan, merawat, dan mencarikan keluarga bagi anjing dan kucing terbiar.",
      quickLinksTitle: "Pautan Pantas",
      visitingHoursTitle: "Waktu Lawatan",
      visitingHoursSchedule: "Selasa – Ahad: 10:00 Pagi – 5:00 Petang",
      closedMondays: "Tutup pada hari Isnin untuk sanitasi menyeluruh",
      locationContactTitle: "Lokasi & Hubungan",
      address: "No. 18, Jalan SS 2/72, 47300 Petaling Jaya, Selangor, Malaysia",
      privacyNotice: "Notis Privasi (PDPA)",
      adoptionTerms: "Syarat Adopsi",
      staffPortal: "Portal Staf",
      copyright: "Hope for Strays. Hak cipta terpelihara.",
    },
  },
};

export function getTranslation(
  lang: Language,
  path: string,
  fallback?: string,
  params?: Record<string, string | number>
): string {
  const dict = translations[lang] || translations.en;
  const fallbackDict = translations.en;

  const keys = path.split(".");
  let current: unknown = dict;
  let currentFallback: unknown = fallbackDict;

  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = (current as Record<string, unknown>)[k];
    } else {
      current = undefined;
    }

    if (currentFallback && typeof currentFallback === "object" && k in currentFallback) {
      currentFallback = (currentFallback as Record<string, unknown>)[k];
    } else {
      currentFallback = undefined;
    }
  }

  let result = typeof current === "string" ? current : typeof currentFallback === "string" ? currentFallback : fallback || path;

  if (params) {
    Object.entries(params).forEach(([paramKey, paramVal]) => {
      result = result.replace(new RegExp(`{${paramKey}}`, "g"), String(paramVal));
    });
  }

  return result;
}

