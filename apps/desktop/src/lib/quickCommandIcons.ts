import type { Component } from 'vue';

import AnalyticsIcon from '~icons/hugeicons/chart-01';
import ArtIcon from '~icons/hugeicons/paint-board';
import AudioIcon from '~icons/hugeicons/mic-01';
import BookIcon from '~icons/hugeicons/book-01';
import CalendarIcon from '~icons/hugeicons/calendar-01';
import ChatIcon from '~icons/hugeicons/chat-bot';
import CoffeeIcon from '~icons/hugeicons/coffee-01';
import CodingIcon from '~icons/hugeicons/code-circle';
import CookingIcon from '~icons/hugeicons/chef-hat';
import CommuteIcon from '~icons/hugeicons/train-01';
import DailyClockIcon from '~icons/hugeicons/clock-01';
import DayIcon from '~icons/hugeicons/sun-02';
import ErrandsIcon from '~icons/hugeicons/petrol-pump';
import FitnessIcon from '~icons/hugeicons/dumbbell-01';
import AirplaneIcon from '~icons/hugeicons/airplane-01';
import BabyIcon from '~icons/hugeicons/baby-01';
import BeachIcon from '~icons/hugeicons/beach';
import CarIcon from '~icons/hugeicons/car-01';
import IceCreamIcon from '~icons/hugeicons/ice-cream-01';
import GamingIcon from '~icons/hugeicons/game-controller-01';
import GoalsIcon from '~icons/hugeicons/medal-01';
import IdeasIcon from '~icons/hugeicons/idea-01';
import InspirationIcon from '~icons/hugeicons/quote-down';
import LearningIcon from '~icons/hugeicons/brain-02';
import MixedMediaIcon from '~icons/hugeicons/camera-microphone-01';
import MoneyIcon from '~icons/hugeicons/money-03';
import MusicIcon from '~icons/hugeicons/music-note-01';
import NatureIcon from '~icons/hugeicons/leaf-01';
import NightIcon from '~icons/hugeicons/moon';
import PhotoIcon from '~icons/hugeicons/camera-01';
import RunningIcon from '~icons/hugeicons/running-shoes';
import SecurityIcon from '~icons/hugeicons/shield-01';
import ShoppingIcon from '~icons/hugeicons/shopping-cart-01';
import TrainIcon from '~icons/hugeicons/train-02';
import TimerIcon from '~icons/hugeicons/timer-01';
import VideoIcon from '~icons/hugeicons/video-01';
import WeatherIcon from '~icons/hugeicons/cloud';
import WellbeingIcon from '~icons/hugeicons/heart-add';
import WorldIcon from '~icons/hugeicons/globe';
import WritingIcon from '~icons/hugeicons/edit-01';

export type QuickCommandIconOption = {
  value: string;
  labelKey: string;
  component: Component;
};

export const DEFAULT_QUICK_COMMAND_ICON = 'chat-bot';

/**
 * Shared icon palette for quick commands. Label keys point to i18n entries under
 * settings.quick_commands.icons.<labelKey>.
 */
export const QUICK_COMMAND_ICONS: QuickCommandIconOption[] = [
  { value: 'chat-bot', labelKey: 'chat', component: ChatIcon },
  { value: 'calendar-01', labelKey: 'calendar', component: CalendarIcon },
  { value: 'book-01', labelKey: 'reading', component: BookIcon },
  { value: 'music-note-01', labelKey: 'music', component: MusicIcon },
  { value: 'dumbbell-01', labelKey: 'fitness', component: FitnessIcon },
  { value: 'globe', labelKey: 'world', component: WorldIcon },
  { value: 'code-circle', labelKey: 'coding', component: CodingIcon },
  { value: 'video-01', labelKey: 'video', component: VideoIcon },
  { value: 'idea-01', labelKey: 'ideas', component: IdeasIcon },
  { value: 'camera-01', labelKey: 'photo', component: PhotoIcon },
  { value: 'edit-01', labelKey: 'writing', component: WritingIcon },
  { value: 'chart-01', labelKey: 'analytics', component: AnalyticsIcon },
  { value: 'heart-add', labelKey: 'wellbeing', component: WellbeingIcon },
  { value: 'chef-hat', labelKey: 'cooking', component: CookingIcon },
  { value: 'shopping-cart-01', labelKey: 'shopping', component: ShoppingIcon },
  { value: 'airplane-01', labelKey: 'flights', component: AirplaneIcon },
  { value: 'medal-01', labelKey: 'goals', component: GoalsIcon },
  { value: 'leaf-01', labelKey: 'nature', component: NatureIcon },
  { value: 'mic-01', labelKey: 'audio', component: AudioIcon },
  { value: 'game-controller-01', labelKey: 'gaming', component: GamingIcon },
  { value: 'money-03', labelKey: 'finance', component: MoneyIcon },
  { value: 'brain-02', labelKey: 'learning', component: LearningIcon },
  { value: 'coffee-01', labelKey: 'coffee', component: CoffeeIcon },
  { value: 'shield-01', labelKey: 'security', component: SecurityIcon },
  { value: 'train-01', labelKey: 'commute', component: CommuteIcon },
  { value: 'sun-02', labelKey: 'day', component: DayIcon },
  { value: 'moon', labelKey: 'night', component: NightIcon },
  { value: 'running-shoes', labelKey: 'running', component: RunningIcon },
  { value: 'paint-board', labelKey: 'art', component: ArtIcon },
  { value: 'quote-down', labelKey: 'inspiration', component: InspirationIcon },
  { value: 'timer-01', labelKey: 'timer', component: TimerIcon },
  { value: 'cloud', labelKey: 'weather', component: WeatherIcon },
  { value: 'petrol-pump', labelKey: 'errands', component: ErrandsIcon },
  { value: 'camera-microphone-01', labelKey: 'recordings', component: MixedMediaIcon },
  { value: 'clock-01', labelKey: 'clock', component: DailyClockIcon },
  { value: 'baby-01', labelKey: 'kids', component: BabyIcon },
  { value: 'car-01', labelKey: 'car', component: CarIcon },
  { value: 'train-02', labelKey: 'train', component: TrainIcon },
  { value: 'ice-cream-01', labelKey: 'icecream', component: IceCreamIcon },
  { value: 'beach', labelKey: 'vacation', component: BeachIcon },
];

export const QUICK_COMMAND_ICON_MAP = new Map(
  QUICK_COMMAND_ICONS.map((option) => [option.value, option.component]),
);

/**
 * Resolves an icon string into a Vue component, falling back to the default icon.
 */
export function resolveQuickCommandIcon(value?: string): Component {
  const match =
    QUICK_COMMAND_ICON_MAP.get(value ?? '') ??
    QUICK_COMMAND_ICON_MAP.get(DEFAULT_QUICK_COMMAND_ICON);
  return match ?? QUICK_COMMAND_ICONS[0].component;
}
