"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageCircle,
  Calendar,
  CheckSquare,
  Download,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  Users,
  Bell,
  BarChart3,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
// import { Button } from "@/components/ui/shadcnComponents/button";
// import {
//   Card,
//   CardContent
// } from "@/components/ui/shadcnComponents/card";
interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}
interface MobileNavLinkProps {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}
// Feature data
const features = [
  {
    title: "Team Chat",
    description:
      "Real-time messaging with teammates across projects and departments",
    icon: MessageCircle,
    color: "from-red-600 to-red-800",
  },
  {
    title: "Smart Scheduling",
    description:
      "Intelligent calendar management with conflict resolution and reminders",
    icon: Calendar,
    color: "from-red-700 to-red-900",
  },
  {
    title: "Task Management",
    description:
      "Assign, track, and complete tasks with deadline monitoring and priority levels",
    icon: CheckSquare,
    color: "from-red-800 to-red-950",
  },
  {
    title: "Team Collaboration",
    description:
      "Create teams, assign members and set permissions for different projects",
    icon: Users,
    color: "from-red-600 to-red-800",
  },
  {
    title: "Smart Notifications",
    description:
      "Customizable alerts for messages, task updates, and important deadlines",
    icon: Bell,
    color: "from-red-700 to-red-900",
  },
  {
    title: "Advanced Analytics",
    description:
      "Real-time performance metrics for teams, projects, and individual tasks",
    icon: BarChart3,
    color: "from-red-800 to-red-950",
  },
];

// Testimonial data
const testimonials = [
  {
    name: "Alex Thompson",
    position: "Product Manager",
    content:
      "Takeover has completely transformed how our team collaborates. The seamless integration between chat and task management is a game-changer.",
  },
  {
    name: "Sarah Chen",
    position: "Team Lead",
    content:
      "The scheduling features alone have saved us countless hours of back-and-forth. Takeover has become essential to our daily workflow.",
  },
  {
    name: "Marcus Johnson",
    position: "Director of Operations",
    content:
      "The analytics dashboard gives me instant visibility into team performance. I can identify bottlenecks and optimize workflows in real-time.",
  },
];

export default function LandingPage() {
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Responsive states
  // const [windowWidth, setWindowWidth] = useState(
  //   typeof window !== "undefined" ? window.innerWidth : 0
  // );

  useEffect(() => {
    const handleResize = () => {
      // setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Auto rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // const isMobile = windowWidth < 768;
  // const isTablet = windowWidth >= 768 && windowWidth < 1024;

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Navigation */}
      <nav className="relative z-50 px-4 py-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo Placeholder */}
          <div className="flex items-center">
            <Image
              src="/codewithali.png"
              alt="Takeover logo"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="ml-2 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-red-600">
              Takeover
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex space-x-8">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#how-it-works">How It Works</NavLink>
            <NavLink href="#testimonials">Testimonials</NavLink>
            <NavLink href="#download">Download</NavLink>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-16 left-0 right-0 bg-black/95 border-y border-red-950/30 backdrop-blur-sm md:hidden z-50"
            >
              <div className="flex flex-col p-4 space-y-4">
                <MobileNavLink
                  href="#features"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Features
                </MobileNavLink>
                <MobileNavLink
                  href="#how-it-works"
                  onClick={() => setIsMenuOpen(false)}
                >
                  How It Works
                </MobileNavLink>
                <MobileNavLink
                  href="#testimonials"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Testimonials
                </MobileNavLink>
                <MobileNavLink
                  href="#download"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Download
                </MobileNavLink>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 md:pt-24 pb-24 md:pb-32 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-black opacity-70"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-red-950/30 to-transparent"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-red-600">
                    Take Over
                  </span>{" "}
                  Your Productivity
                </h1>
                <p className="text-lg md:text-xl text-red-200/80 mb-8 max-w-xl">
                  The all-in-one workspace for teams to chat, schedule, and
                  manage tasks with intelligent features that streamline your
                  workflow.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 
                      text-white border border-red-800/30 shadow-lg shadow-red-950/20 px-8"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    <Link href="https://github.com/CodeWithAli-Co/CWA-TakeOver/releases/latest" target="_blank">
                      Download Now
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-red-800/30 text-red-400 bg-red-950/20 hover:bg-red-950/20 hover:text-white px-8"
                  >
                    Learn More
                    <ChevronDown className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </motion.div>
            </div>

            {/* App Preview */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="hidden lg:block relative"
            >
              <div className="relative bg-black/60 border border-red-950/30 rounded-xl overflow-hidden shadow-2xl shadow-red-950/20">
                <div className="p-1 bg-gradient-to-r from-red-950 to-red-900/20">
                  <div className="flex items-center space-x-2 px-3 py-1">
                    <div className="w-3 h-3 rounded-full bg-red-800"></div>
                    <div className="w-3 h-3 rounded-full bg-red-900/60"></div>
                    <div className="w-3 h-3 rounded-full bg-red-900/40"></div>
                    <div className="text-xs text-red-400/60 ml-2">
                      Takeover App
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-12 gap-4 h-80">
                    <div className="col-span-3 bg-black/40 border border-red-950/20 rounded-lg p-3">
                      <div className="space-y-3">
                        <div className="flex items-center text-red-400 text-sm font-medium">
                          <Users className="w-4 h-4 mr-2" />
                          Teams
                        </div>
                        <div className="space-y-2">
                          {["Marketing", "Development", "Design"].map(
                            (team) => (
                              <div
                                key={team}
                                className="px-2 py-1 text-sm rounded bg-red-950/20 text-red-300"
                              >
                                {team}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-9 bg-black/40 border border-red-950/20 rounded-lg flex flex-col">
                      <div className="border-b border-red-950/20 p-3 flex justify-between items-center">
                        <span className="text-red-400 font-medium">
                          Project Dashboard
                        </span>
                        <div className="flex space-x-3">
                          <Bell className="w-4 h-4 text-red-500/70" />
                          <Settings className="w-4 h-4 text-red-500/70" />
                        </div>
                      </div>
                      <div className="p-3 flex-1 flex flex-col">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-gradient-to-br from-red-950/30 to-red-900/10 rounded p-3">
                            <div className="text-xs text-red-400/60 mb-1">
                              Active Tasks
                            </div>
                            <div className="text-xl font-bold text-red-300">
                              24
                            </div>
                          </div>
                          <div className="bg-gradient-to-br from-red-950/30 to-red-900/10 rounded p-3">
                            <div className="text-xs text-red-400/60 mb-1">
                              Completed
                            </div>
                            <div className="text-xl font-bold text-red-300">
                              18
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 bg-black/20 rounded-lg p-2 overflow-hidden">
                          <div className="space-y-2">
                            {[
                              "Website Redesign",
                              "Content Strategy",
                              "App Release",
                            ].map((task) => (
                              <div
                                key={task}
                                className="px-3 py-2 bg-black/30 border border-red-950/20 rounded flex justify-between items-center"
                              >
                                <span className="text-sm text-red-200">
                                  {task}
                                </span>
                                <CheckSquare className="w-4 h-4 text-red-500/70" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-600/10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-red-800/10 rounded-full blur-3xl"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="py-20 md:py-32 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-black to-transparent z-10"></div>
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-900/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-700/10 rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 relative z-20">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Powerful Features for Modern Teams
              </h2>
              <p className="text-red-200/60 text-lg max-w-2xl mx-auto">
                Takeover combines all the tools your team needs in one intuitive
                platform, eliminating app-switching and streamlining your
                workflow.
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="bg-black/60 border-red-950/30 backdrop-blur-sm h-full overflow-hidden group">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="mb-5">
                      <div
                        className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.color} p-3 mb-4 transform group-hover:scale-110 transition-transform`}
                      >
                        <feature.icon className="w-full h-full text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-red-200/60">{feature.description}</p>
                    </div>
                    <div className="mt-auto pt-4">
                      <Button
                        variant="ghost"
                        className="p-0 text-red-400 hover:text-red-300 hover:bg-transparent group"
                      >
                        Learn moress
                        <ArrowRight className="ml-2 h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 md:py-32 bg-red-950/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                How Takeover Works
              </h2>
              <p className="text-red-200/60 text-lg max-w-2xl mx-auto">
                A seamless experience from onboarding to daily productivity
              </p>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 md:gap-6">
            {[
              {
                number: "01",
                title: "Connect Your Team",
                description:
                  "Invite team members, create departments, and establish your organizational structure.",
                icon: Users,
              },
              {
                number: "02",
                title: "Set Up Projects",
                description:
                  "Create projects, define milestones, and assign team members to specific tasks.",
                icon: CheckSquare,
              },
              {
                number: "03",
                title: "Work Smarter",
                description:
                  "Communicate, plan, and execute in one place with real-time updates and smart notifications.",
                icon: Bell,
              },
            ].map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="relative"
              >
                <div className="bg-black/60 border border-red-950/30 rounded-xl p-6 h-full">
                  <div className="absolute -top-5 -left-2">
                    <span className="text-5xl font-bold text-red-950/70">
                      {step.number}
                    </span>
                  </div>
                  <div className="pt-6">
                    <div className="mb-4 flex items-center">
                      <step.icon className="w-6 h-6 text-red-500 mr-3" />
                      <h3 className="text-xl font-bold text-white">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-red-200/60">{step.description}</p>
                  </div>
                </div>

                {index < 2 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 transform translate-x-full">
                    <ArrowRight className="w-6 h-6 text-red-700/50" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section
        id="testimonials"
        className="py-20 md:py-32 relative overflow-hidden"
      >
        <div className="absolute -top-40 left-40 w-80 h-80 bg-red-800/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-40 w-80 h-80 bg-red-700/10 rounded-full blur-3xl"></div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-12 relative z-10">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                What Our Users Say
              </h2>
              <p className="text-red-200/60 text-lg max-w-2xl mx-auto">
                Teams of all sizes use Takeover to transform their productivity
              </p>
            </motion.div>
          </div>

          <div className="relative min-h-[300px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTestimonial}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                className="bg-black/60 border border-red-950/30 rounded-xl p-8 md:p-10"
              >
                <div className="flex flex-col items-center">
                  <div className="mb-6">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M11.3 6.2H6.8C5.8 6.2 5 7 5 8V12.5C5 13.5 5.8 14.3 6.8 14.3H9.5V16.1C9.5 17 10.6 17.5 11.3 16.8L13.9 14.2V8C13.9 7 13.1 6.2 12.1 6.2H11.3Z"
                        fill="rgba(220, 38, 38, 0.7)"
                      />
                      <path
                        d="M18 6.2H16V11.4L14.7 12.7V14.9L17.2 12.4C17.7 11.9 18 11.2 18 10.5V8C18 7 17.2 6.2 16.2 6.2H16"
                        fill="rgba(220, 38, 38, 0.7)"
                      />
                    </svg>
                  </div>
                  <p className="text-lg md:text-xl text-center mb-8">
                    &quot;{testimonials[activeTestimonial].content}&quot;
                  </p>
                  <div className="text-center">
                    <div className="font-bold text-white">
                      {testimonials[activeTestimonial].name}
                    </div>
                    <div className="text-red-400/70 text-sm">
                      {testimonials[activeTestimonial].position}
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center mt-8">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTestimonial(index)}
                  className={`mx-1 w-3 h-3 rounded-full transition-colors ${
                    index === activeTestimonial
                      ? "bg-red-600"
                      : "bg-red-900/30 hover:bg-red-800/50"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section
        id="download"
        className="py-20 md:py-32 bg-gradient-to-b from-black to-red-950/20 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-red-700/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-red-800/10 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 lg:px-12 relative z-10">
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Ready to Take Over Your Workflow?
              </h2>
              <p className="text-red-200/60 text-lg max-w-2xl mx-auto">
                Download Takeover today and transform how your team works
                together. Available on all major platforms.
              </p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="bg-black/60 border border-red-950/30 rounded-xl p-8 md:p-10 backdrop-blur-sm"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold text-white mb-4">
                  Download for Any Device
                </h3>
                <p className="text-red-200/60 mb-6">
                  Takeover works seamlessly across desktop and mobile, with
                  native apps for Windows, macOS, iOS, and Android.
                </p>
                <div className="space-y-4">
                  <Button
                    size="lg"
                    className="w-full bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 
                      text-white border border-red-800/30 shadow-lg shadow-red-950/20"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    <Link href="https://github.com/CodeWithAli-Co/CWA-TakeOver/releases/latest" target="_blank">
                      Download for Windows
                    </Link>
                  </Button>
                  {/* <Button
                    size="lg"
                    className="w-full bg-gradient-to-r from-red-800 to-red-950 hover:from-red-700 hover:to-red-900 
                      text-white border border-red-800/30 shadow-lg shadow-red-950/20"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Download for macOS
                  </Button>
                  <div className="flex gap-4">
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 border-red-800/30 text-red-400 bg-red-950/20 hover:bg-red-950/20 hover:text-white"
                    >
                      iOS App
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 border-red-800/30 text-red-400 bg-red-950/20 hover:bg-red-950/20 hover:text-white"
                    >
                      Android App
                    </Button>
                  </div> */}
                </div>
              </div>

              <div className="hidden lg:block">
                <div className="relative">
                  {/* App icon placeholder */}
                  <div className="w-48 h-48 mx-auto bg-gradient-to-br from-red-700 to-red-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-red-950/30 transform hover:rotate-3 hover:scale-105 transition-transform">
                    <Image
                      src="/codewithali.png"
                      alt="Takeover logo"
                      width={200}
                      height={100}
                      className="rounded-lg"
                    />
                  </div>

                  {/* Decorative elements */}
                  <div className="absolute top-0 left-0 w-full h-full">
                    <div className="absolute -top-10 -right-10 w-20 h-20 bg-red-600/20 rounded-full blur-xl"></div>
                    <div className="absolute -bottom-5 -left-5 w-16 h-16 bg-red-800/20 rounded-full blur-xl"></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-red-950/30">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <div className="flex items-center mb-4">
                <div className="h-8 w-8 bg-gradient-to-br from-red-600 to-red-900 rounded-lg flex items-center justify-center">
                  <Image
                    src="/codewithali.png"
                    alt="Code with Ali"
                    width={200}
                    height={100}
                    className="your-image-classes"
                  />
                </div>
                <span className="ml-2 text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-red-600">
                  Takeover
                </span>
              </div>
              <p className="text-sm text-red-200/60 mb-4">
                The complete workspace for modern teams to collaborate,
                communicate, and coordinate.
              </p>
              <div className="flex space-x-4">
                {/* Social icons placeholders */}
                {/* {[1, 2, 3, 4].map((i) => (
                  <a
                    key={i}
                    href="#"
                    className="w-8 h-8 rounded-full bg-red-950/30 flex items-center justify-center hover:bg-red-900/50 transition-colors"
                  >
                    <span className="text-xs text-red-400">{i}</span>
                  </a>
                ))} */}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                {[
                  "Features",
                  "Pricing",
                  "Integrations",
                  "Updates",
                  "Roadmap",
                ].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-red-200/60 hover:text-red-300 transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                {["About", "Blog", "Careers", "Customers", "Contact"].map(
                  (item) => (
                    <li key={item}>
                      <a
                        href="#"
                        className="text-red-200/60 hover:text-red-300 transition-colors"
                      >
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-white mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                {[
                  "Documentation",
                  "Help Center",
                  "Community",
                  "Security",
                  "Privacy",
                ].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-red-200/60 hover:text-red-300 transition-colors"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-red-950/30 flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-red-200/60 mb-4 md:mb-0">
              © 2025 Takeover App. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a
                href="#"
                className="text-sm text-red-200/60 hover:text-red-300 transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="#"
                className="text-sm text-red-200/60 hover:text-red-300 transition-colors"
              >
                Terms of Service
              </a>
              <a
                href="#"
                className="text-sm text-red-200/60 hover:text-red-300 transition-colors"
              >
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Utility components
function NavLink({ href, children }: NavLinkProps) {
  return (
    <a
      href={href}
      className="text-red-200/80 hover:text-red-300 transition-colors"
    >
      {children}
    </a>
  );
}

function MobileNavLink({ href, onClick, children }: MobileNavLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="flex items-center py-2 px-3 text-red-200/80 hover:text-red-300 transition-colors"
    >
      {children}
      <ArrowRight className="ml-auto h-4 w-4" />
    </a>
  );
}
