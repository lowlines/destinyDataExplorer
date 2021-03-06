import React, { Component } from 'react';
import { connect } from 'react-redux';
import { isString } from 'lodash';
import cx from 'classnames';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import {
  toggleCollectMode,
  toggleSearchHelp,
  addCollectedItem,
  removeCollectedItem
} from 'src/store/app';
import { setBulkDefinitions } from 'src/store/definitions';
import { getAllDefinitions } from 'src/lib/definitions';
import { makeTypeShort, getRandomItems } from 'src/lib/destinyUtils';
import search from 'src/lib/search';

import Loading from 'src/components/Loading';
import CollectDrawer from 'src/components/CollectDrawer';
import SearchHeader from 'src/components/SearchHeader';
import DataView from 'src/components/DataView';
import Item from 'src/components/Item';

import lookup from './lookup';
import s from './styles.styl';

function parsePathSegment(segment) {
  const [type, hash] = segment.split(':');
  return { type: `Destiny${type}Definition`, shortType: type, hash };
}

function parsePath(splat) {
  if (!splat) {
    return [];
  }

  return splat.split('/').map(parsePathSegment);
}

class HomeView extends Component {
  state = {
    loading: true,
    updating: false,
    views: [],
    searchTerm: '',
    results: null
  };

  componentDidMount() {
    if (this.props.routeParams.splat) {
      this.updateViews();
    }

    getAllDefinitions(({ updating }) => {
      this.setState({ updating });
    })
      .then(defs => {
        this.setState({ loading: false });
        this.props.setBulkDefinitions(defs);
      })
      .catch(err => {
        console.log('omg error');
        console.error(err);
        this.setState({ error: true, loading: false, updating: false });
      });
  }

  componentDidUpdate(prevProps) {
    if (this.props.routeParams.splat !== prevProps.routeParams.splat) {
      this.updateViews();
    }
  }

  updateViews() {
    const segments = parsePath(this.props.routeParams.splat);
    this.setState({ views: segments });
  }

  onSearchChange = ev => {
    const MAX_RESULTS = 150;
    const searchTerm = isString(ev) ? ev : ev.target.value;
    console.log('searchTerm:', searchTerm);

    const empty = [];

    const newState = {
      searchTerm,
      results: empty,
      allResults: empty,
      noResults: false,
      totalResults: 0
    };

    if (!searchTerm || searchTerm.length === 0) {
      this.setState(newState);
      return;
    }

    const results = search(searchTerm, this.props.definitions);
    newState.results = results;
    newState.allResults = newState.results;

    if (results.length > MAX_RESULTS) {
      newState.results = results.slice(0, MAX_RESULTS);
    } else if (results.length === 0) {
      newState.noResults = true;
    }

    this.setState(newState);

    if (this.props.searchHelpEnabled) {
      this.props.toggleSearchHelp();
    }
  };

  displayAllResults = () => {
    this.setState({
      results: this.state.allResults
    });
  };

  pathForItem = (type, obj) => {
    // TODO: some places in the code pass through a definition item directly rather than one of our
    // 'obj' wrappers
    let url = '';
    const shortType = makeTypeShort(type);
    const key = obj.def ? obj.key : obj.hash;

    if (this.props.routeParams.splat) {
      url = `${this.props.location.pathname}/${shortType}:${key}`;
    } else {
      url = `/i/${shortType}:${key}`;
    }

    return url;
  };

  popView = () => {
    const newViews = [...this.state.views];
    newViews.pop();

    const newPath =
      newViews.length === 0
        ? '/'
        : '/i/' +
          newViews.map(view => `${view.shortType}:${view.hash}`).join('/');

    this.props.router.push(newPath);
  };

  lookupLinkedItem = (keyPath, hash) => {
    const [fieldName, parentFieldName] = keyPath;

    let { type: definitionType, shortType } =
      lookup.find(data => data.fields.includes(fieldName)) ||
      lookup.find(data => data.fields.includes(parentFieldName)) ||
      {};

    if (!definitionType) {
      // TODO: guess items in array using parentFieldName e.g. itemCategoryHashes
      const matchedGuess = fieldName.match && fieldName.match(/(\w+)Hash/);
      shortType =
        matchedGuess && matchedGuess[1].replace(/^\w/, c => c.toUpperCase());
      definitionType = `Destiny${shortType}Definition`;
    }

    const defs = this.props.definitions[definitionType];

    if (!defs) {
      return null;
    }

    const item = defs[hash];
    return { definitionType: shortType, item };
  };

  onItemClick = (ev, entry) => {
    if (this.props.collectModeEnabled) {
      ev.preventDefault();

      if (entry.type !== 'DestinyInventoryItemDefinition') {
        return;
      }

      const entryToAdd = { ...entry, def: undefined };

      if (this.props.collectedItems[entry.dxId]) {
        this.props.removeCollectedItem(entryToAdd);
      } else {
        this.props.addCollectedItem(entryToAdd);
      }
    }
  };

  render() {
    const {
      collectModeEnabled,
      searchHelpEnabled,
      toggleCollectMode,
      toggleSearchHelp,
      collectedItems,
      definitions
    } = this.props;

    const {
      loading,
      updating,
      views,
      searchTerm,
      results,
      allResults,
      noResults,
      error
    } = this.state;

    let items = results || [];

    if (items.length < 1 && !noResults) {
      items = getRandomItems(this.props.definitions);
    }

    return (
      <div className={s.root}>
        <SearchHeader
          definitions={this.props.definitions}
          onSearchChange={this.onSearchChange}
          searchValue={searchTerm}
          toggleCollectMode={toggleCollectMode}
          collectModeEnabled={collectModeEnabled}
          searchHelpEnabled={searchHelpEnabled}
          toggleSearchHelp={toggleSearchHelp}
        />

        <div className={s.body}>
          <div
            className={cx(s.main, collectModeEnabled && s.collectDrawerOpen)}
          >
            {loading && (
              <Loading
                children={
                  updating ? 'Downloading new data from Bungie...' : null
                }
              />
            )}
            {error && <Loading noSpin children="Error loading manifest" />}
            {noResults && <h2>No results</h2>}

            <div className={s.items}>
              {items.map(obj => {
                return (
                  <Item
                    key={obj.dxId}
                    entry={obj}
                    className={s.item}
                    pathForItem={this.pathForItem}
                    onClick={this.onItemClick}
                    isCollected={collectedItems[obj.dxId]}
                  />
                );
              })}
            </div>

            {results &&
              allResults &&
              results !== allResults && (
                <h2>
                  {allResults.length - results.length} more results hidden for
                  performance.{' '}
                  <button onClick={this.displayAllResults}>
                    Display all anyway
                  </button>
                </h2>
              )}
          </div>

          {collectModeEnabled && (
            <div className={s.side}>
              <div className={s.collectDrawer}>
                <div className={s.collectDrawerInner}>
                  <CollectDrawer
                    items={collectedItems}
                    definitions={definitions}
                    removeItem={this.props.removeCollectedItem}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <ReactCSSTransitionGroup
          transitionName="global-dataview-animation"
          transitionEnterTimeout={200}
          transitionLeaveTimeout={200}
        >
          {views.map(
            ({ type, hash }, index) =>
              this.props.definitions[type] && (
                <div key={`${type}:${hash}`}>
                  <DataView
                    definitions={definitions}
                    depth={index + 1}
                    className={s.dataView}
                    item={this.props.definitions[type][hash]}
                    type={type}
                    onRequestClose={this.popView}
                    lookupLinkedItem={this.lookupLinkedItem}
                    pathForItem={this.pathForItem}
                  />
                </div>
              )
          )}
        </ReactCSSTransitionGroup>
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    definitions: state.definitions,
    collectModeEnabled: state.app.collectModeEnabled,
    searchHelpEnabled: state.app.searchHelpEnabled,
    collectedItems: state.app.collectedItems
  };
}

const mapDispatchToActions = {
  setBulkDefinitions,
  toggleCollectMode,
  toggleSearchHelp,
  addCollectedItem,
  removeCollectedItem
};

export default connect(mapStateToProps, mapDispatchToActions)(HomeView);
