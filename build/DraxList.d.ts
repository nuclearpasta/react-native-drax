import { PropsWithChildren, Ref } from 'react';
import { FlatList } from 'react-native';
import { DraxListProps } from './types';
declare type DraxListType = <T extends unknown>(props: PropsWithChildren<DraxListProps<T>> & {
    ref?: Ref<FlatList>;
}) => JSX.Element;
export declare const DraxList: DraxListType;
export {};
